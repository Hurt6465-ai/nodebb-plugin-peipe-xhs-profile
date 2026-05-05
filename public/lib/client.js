// NodeBB plugin: Peipe XHS Mobile Profile
// Mobile Xiaohongshu-style NodeBB account page with no original-style flash,
// multilingual labels, and cover image pre-upload compression.

if (typeof URL !== 'undefined' && typeof URL.canParse !== 'function') {
  URL.canParse = function (url, base) {
    try {
      if (base === undefined) {
        new URL(url);
      } else {
        new URL(url, base);
      }
      return true;
    } catch (e) {
      return false;
    }
  };
}

(function () {
  'use strict';

  const MOBILE_MAX = 768;
  const MAX_INIT_RETRIES = 60;
  const INIT_TIMEOUT_MS = 5000;
  const RESIZE_DEBOUNCE_MS = 120;
  const EARLY_STYLE_ID = 'xhs-profile-early-noflash-style';

  const IMAGE_CONFIG = {
    useWebp: false,
    minCompressBytes: 120 * 1024,
    targetBytes: Math.round(0.38 * 1024 * 1024),
    maxSizeMB: 0.38,
    maxWidthOrHeight: 720,
    initialQuality: 0.42,
    preserveExif: false,
    beneficialRatio: 0.95,
    coverUploadArmMs: 20000,
    canvasQualities: [0.58, 0.52, 0.46, 0.40, 0.28]
  };

  const I18N = {
    'zh-CN': {
      home: '主页', notes: '笔记', follow: '关注', following: '已关注', followers: '粉丝', views: '浏览',
      chat: '聊天', editProfile: '编辑资料', backProfile: '返回主页', more: '更多',
      settings: '设置', themeSettings: '主题设置', uploadAvatar: '上传头像', uploadCover: '上传背景',
      resizeCover: '调整背景', removeCover: '移除背景', accountInfo: '账号信息',
      muteAccount: '禁言账号', unmuteAccount: '解除禁言', banAccount: '封禁账户', unbanAccount: '解除封禁',
      deleteAccount: '删除账号', deleteContent: '删除内容', deleteAll: '删号和内容',
      flagProfile: '举报资料', alreadyFlagged: '已举报', blockUser: '屏蔽用户', unblockUser: '解除屏蔽',
      yearsOld: '岁'
    },
    'en-GB': {
      home: 'Home', notes: 'Notes', follow: 'Follow', following: 'Following', followers: 'Followers', views: 'Views',
      chat: 'Chat', editProfile: 'Edit profile', backProfile: 'Back to profile', more: 'More',
      settings: 'Settings', themeSettings: 'Theme settings', uploadAvatar: 'Upload avatar', uploadCover: 'Upload cover',
      resizeCover: 'Adjust cover', removeCover: 'Remove cover', accountInfo: 'Account info',
      muteAccount: 'Mute account', unmuteAccount: 'Unmute account', banAccount: 'Ban account', unbanAccount: 'Unban account',
      deleteAccount: 'Delete account', deleteContent: 'Delete content', deleteAll: 'Delete account and content',
      flagProfile: 'Report profile', alreadyFlagged: 'Reported', blockUser: 'Block user', unblockUser: 'Unblock user',
      yearsOld: 'y/o'
    },
    'my-MM': {
      home: 'ပင်မ', notes: 'မှတ်စု', follow: 'Follow လုပ်ရန်', following: 'Follow လုပ်ပြီး', followers: 'ပရိသတ်', views: 'ကြည့်ရှု',
      chat: 'စကားပြော', editProfile: 'ပရိုဖိုင်ပြင်ရန်', backProfile: 'ပရိုဖိုင်သို့ ပြန်ရန်', more: 'နောက်ထပ်',
      settings: 'ဆက်တင်များ', themeSettings: 'Theme ဆက်တင်', uploadAvatar: 'ပရိုဖိုင်ပုံတင်ရန်', uploadCover: 'နောက်ခံပုံတင်ရန်',
      resizeCover: 'နောက်ခံပုံညှိရန်', removeCover: 'နောက်ခံပုံဖယ်ရန်', accountInfo: 'အကောင့်အချက်အလက်',
      muteAccount: 'အကောင့်အသံပိတ်ရန်', unmuteAccount: 'အသံပိတ်မှုဖြုတ်ရန်', banAccount: 'အကောင့်ပိတ်ရန်', unbanAccount: 'ပိတ်မှုဖြုတ်ရန်',
      deleteAccount: 'အကောင့်ဖျက်ရန်', deleteContent: 'အကြောင်းအရာဖျက်ရန်', deleteAll: 'အကောင့်နှင့်အကြောင်းအရာဖျက်ရန်',
      flagProfile: 'ပရိုဖိုင်တိုင်ကြားရန်', alreadyFlagged: 'တိုင်ကြားပြီး', blockUser: 'အသုံးပြုသူကိုပိတ်ရန်', unblockUser: 'ပိတ်ထားမှုဖြုတ်ရန်',
      yearsOld: 'နှစ်'
    }
  };

  let observers = [];
  let initRaf = 0;
  let initObserver = null;
  let initTimeout = 0;
  let resizeTimer = 0;
  let coverUploadArmedUntil = 0;
  let coverUploadCompressionBound = false;
  const encodeSupportCache = {};

  ensureEarlyNoFlashStyle();
  primeEarlyBodyState();


  function ensureEarlyNoFlashStyle() {
    if (typeof document === 'undefined' || document.getElementById(EARLY_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = EARLY_STYLE_ID;
    style.textContent = `
@media (max-width: 768px) {
  html.xhs-profile-html-candidate,
  html.xhs-profile-html-candidate body,
  body.xhs-profile-candidate,
  body.xhs-profile-active {
    background: #fff !important;
    padding-top: 0 !important;
    margin-top: 0 !important;
    overflow-x: hidden !important;
  }

  html.xhs-profile-html-candidate body:not(.xhs-profile-active),
  body.xhs-profile-candidate {
    min-height: 100vh !important;
  }

  body.xhs-profile-candidate #panel,
  body.xhs-profile-candidate main#panel,
  body.xhs-profile-candidate .layout-container,
  body.xhs-profile-candidate #content,
  body.xhs-profile-candidate .content,
  body.xhs-profile-candidate .container,
  body.xhs-profile-candidate .container-lg,
  body.xhs-profile-candidate .container-xl,
  body.xhs-profile-active #panel,
  body.xhs-profile-active main#panel,
  body.xhs-profile-active .layout-container,
  body.xhs-profile-active #content,
  body.xhs-profile-active .content,
  body.xhs-profile-active .container,
  body.xhs-profile-active .container-lg,
  body.xhs-profile-active .container-xl {
    background: #fff !important;
    padding-top: 0 !important;
    margin-top: 0 !important;
    top: 0 !important;
  }

  body.xhs-profile-candidate #header-menu,
  body.xhs-profile-candidate header,
  body.xhs-profile-candidate #header,
  body.xhs-profile-candidate .header,
  body.xhs-profile-candidate .navbar,
  body.xhs-profile-candidate nav.navbar,
  body.xhs-profile-candidate .navbar-header,
  body.xhs-profile-candidate .navbar-container,
  body.xhs-profile-candidate .navbar-fixed-top,
  body.xhs-profile-candidate .fixed-top,
  body.xhs-profile-candidate .sticky-top,
  body.xhs-profile-candidate [component="navbar"],
  body.xhs-profile-candidate [component="navigation/navbar"],
  body.xhs-profile-candidate [component="navbar/search"],
  body.xhs-profile-candidate [component="search"],
  body.xhs-profile-candidate [component="notifications"],
  body.xhs-profile-candidate [component="chat/nav-wrapper"],
  body.xhs-profile-candidate [component="chat/message/notification"],
  body.xhs-profile-candidate [component="bottombar"],
  body.xhs-profile-candidate [data-widget-area="header"],
  body.xhs-profile-candidate .header-spacer,
  body.xhs-profile-candidate .navbar-spacer,
  body.xhs-profile-active #header-menu,
  body.xhs-profile-active header,
  body.xhs-profile-active #header,
  body.xhs-profile-active .header,
  body.xhs-profile-active .navbar,
  body.xhs-profile-active nav.navbar,
  body.xhs-profile-active .navbar-header,
  body.xhs-profile-active .navbar-container,
  body.xhs-profile-active .navbar-fixed-top,
  body.xhs-profile-active .fixed-top,
  body.xhs-profile-active .sticky-top,
  body.xhs-profile-active [component="navbar"],
  body.xhs-profile-active [component="navigation/navbar"],
  body.xhs-profile-active [component="navbar/search"],
  body.xhs-profile-active [component="search"],
  body.xhs-profile-active [component="notifications"],
  body.xhs-profile-active [component="chat/nav-wrapper"],
  body.xhs-profile-active [component="chat/message/notification"],
  body.xhs-profile-active [component="bottombar"],
  body.xhs-profile-active [data-widget-area="header"],
  body.xhs-profile-active .header-spacer,
  body.xhs-profile-active .navbar-spacer {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
    height: 0 !important;
    min-height: 0 !important;
    max-height: 0 !important;
    overflow: hidden !important;
  }

  body.xhs-profile-candidate .account,
  body.xhs-profile-candidate [component="account/cover"],
  body.xhs-profile-candidate .cover,
  body.xhs-profile-candidate .account-header,
  body.xhs-profile-candidate .profile-header,
  body.xhs-profile-candidate .user-profile-header,
  body.xhs-profile-candidate [class*="account-header"],
  body.xhs-profile-candidate [class*="profile-header"],
  body.xhs-profile-candidate [class*="profileHeader"],
  body.xhs-profile-candidate [class*="cover"],
  body.xhs-profile-candidate [class*="Cover"],
  body.xhs-profile-candidate [class*="skeleton"],
  body.xhs-profile-candidate [class*="Skeleton"],
  body.xhs-profile-candidate [class*="placeholder"],
  body.xhs-profile-candidate [class*="Placeholder"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) .account,
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [component="account/cover"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) .cover,
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) .account-header,
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) .profile-header,
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) .user-profile-header,
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="account-header"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="profile-header"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="profileHeader"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="cover"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="Cover"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="skeleton"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="Skeleton"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="placeholder"],
  html.xhs-profile-html-candidate body:not(.xhs-profile-active) [class*="Placeholder"] {
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  body.xhs-profile-candidate #xhs-profile-shell,
  body.xhs-profile-candidate #xhs-profile-header,
  body.xhs-profile-candidate #xhs-profile-topmenu,
  body.xhs-profile-candidate #xhs-tab-nav,
  body.xhs-profile-active #xhs-profile-shell,
  body.xhs-profile-active #xhs-profile-header,
  body.xhs-profile-active #xhs-profile-topmenu,
  body.xhs-profile-active #xhs-tab-nav {
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
    height: auto !important;
    min-height: initial !important;
    max-height: none !important;
    overflow: visible !important;
    pointer-events: auto !important;
  }

  body.xhs-profile-active #xhs-profile-header .xhs-cover,
  body.xhs-profile-active #xhs-profile-header .xhs-cover-shade,
  body.xhs-profile-active #xhs-profile-header .xhs-header-overlay,
  body.xhs-profile-active #xhs-profile-header .xhs-avatar-wrap,
  body.xhs-profile-active #xhs-profile-header .xhs-avatar-circle,
  body.xhs-profile-active #xhs-profile-header .xhs-avatar-img,
  body.xhs-profile-active #xhs-profile-header .xhs-avatar-fallback {
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }
}
`;

    (document.head || document.documentElement).appendChild(style);
  }

  $(window).on('action:ajaxify.start', function () {
    cleanupInjected();

    // Keep the original profile hidden during ajaxify transitions. If the next
    // route is not a profile page, action:ajaxify.end restores the normal UI.
    if (window.innerWidth <= MOBILE_MAX && isAccountPage()) {
      setEarlyCandidateState(true);
    } else {
      restoreGlobalUI();
    }
  });

  $(window).on('action:ajaxify.end', function () {
    primeEarlyBodyState();

    if (!isAccountPage()) {
      cleanupInjected();
      restoreGlobalUI();
      return;
    }

    scheduleInit();
  });

  $(document).ready(function () {
    primeEarlyBodyState();

    if (isAccountPage()) {
      scheduleInit();
    }
  });

  $(window).on('resize', function () {
    if (!isAccountPage()) return;

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = 0;
    }

    resizeTimer = setTimeout(function () {
      resizeTimer = 0;

      if (window.innerWidth > MOBILE_MAX) {
        cleanupInjected();
        restoreGlobalUI();
      } else {
        primeEarlyBodyState();
        scheduleInit();
      }
    }, RESIZE_DEBOUNCE_MS);
  });

  function primeEarlyBodyState() {
    const shouldPrime = window.innerWidth <= MOBILE_MAX && routeLooksLikeAccountPage();

    if (document.documentElement) {
      document.documentElement.classList.toggle('xhs-profile-html-candidate', shouldPrime);
    }

    if (!document.body) {
      if (shouldPrime && document.addEventListener) {
        document.addEventListener('DOMContentLoaded', primeEarlyBodyState, { once: true });
      }
      return;
    }

    setEarlyCandidateState(shouldPrime);
  }

  function setEarlyCandidateState(shouldPrime) {
    if (document.documentElement) {
      document.documentElement.classList.toggle('xhs-profile-html-candidate', !!shouldPrime);
    }

    if (!document.body) return;

    if (shouldPrime) {
      $('body').addClass('xhs-profile-candidate').removeClass('xhs-profile-active xhs-profile-failed');
    } else {
      $('body').removeClass('xhs-profile-candidate');
      if (document.documentElement) {
        if (document.documentElement) {
        document.documentElement.classList.remove('xhs-profile-html-candidate');
      }
      }
    }
  }

  function routeLooksLikeAccountPage() {
    const parts = getPathParts();
    return parts.indexOf('user') !== -1 && !!parts[parts.indexOf('user') + 1];
  }

  function isAccountPage() {
    const data = window.ajaxify && window.ajaxify.data;
    const tpl = data && data.template && data.template.name;

    if (tpl && tpl.indexOf('account/') === 0) return true;
    if (routeLooksLikeAccountPage()) return true;

    if (!document.body || !document.body.classList) return false;

    return Array.prototype.some.call(document.body.classList, function (cls) {
      return cls === 'page-user' || cls.indexOf('page-user-') === 0;
    });
  }

  function scheduleInit() {
    cleanupInitWait();

    if (window.innerWidth > MOBILE_MAX) {
      cleanupInjected();
      restoreGlobalUI();
      return;
    }

    function tryInit() {
      if (!isAccountPage()) return false;

      if (window.innerWidth > MOBILE_MAX) {
        cleanupInjected();
        restoreGlobalUI();
        return true;
      }

      const found = findAccountDom();

      if (found.$account.length && found.$top.length) {
        cleanupInitWait();
        initXiaohongshuProfile(found.$account, found.$top);
        return true;
      }

      return false;
    }

    if (tryInit()) return;

    if (window.MutationObserver && document.body) {
      initObserver = new MutationObserver(function () {
        tryInit();
      });

      initObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    let tries = 0;

    function rafFallback() {
      tries += 1;

      if (tryInit()) return;

      if (tries < MAX_INIT_RETRIES) {
        initRaf = requestAnimationFrame(rafFallback);
      }
    }

    initRaf = requestAnimationFrame(rafFallback);

    initTimeout = setTimeout(function () {
      cleanupInitWait();
      $('body').removeClass('xhs-profile-candidate').addClass('xhs-profile-failed');
      document.documentElement.classList.remove('xhs-profile-html-candidate');
    }, INIT_TIMEOUT_MS);
  }

  function cleanupInitWait() {
    if (initRaf) {
      cancelAnimationFrame(initRaf);
      initRaf = 0;
    }

    if (initObserver) {
      try {
        initObserver.disconnect();
      } catch (e) {}
      initObserver = null;
    }

    if (initTimeout) {
      clearTimeout(initTimeout);
      initTimeout = 0;
    }
  }

  function findAccountDom() {
    const $account = $('.account').first();
    let $top = $();

    if ($account.length) {
      $top = $account
        .find('> .d-flex.flex-column.flex-md-row.gap-2.w-100.pb-4.mb-4.mt-2.border-bottom')
        .first();

      if (!$top.length) {
        $top = $account
          .children('.d-flex')
          .filter(function () {
            const $el = $(this);
            return $el.find('.avatar-wrapper').length &&
              ($el.find('.fullname').length || $el.find('.username').length);
          })
          .first();
      }

      if (!$top.length) {
        $top = $account
          .find('[component="account/profile"], [component="account/header"], .account-header, .profile-header, .user-profile-header, .ha-profile-header')
          .filter(function () {
            const $el = $(this);
            return $el.find('.avatar-wrapper, [component="avatar/picture"], img[component="avatar/picture"], .avatar, .user-icon').length ||
              $el.find('.fullname, .username, [component="account/username"], [component="account/fullname"]').length;
          })
          .first();
      }

      if (!$top.length) {
        $top = $account
          .find('.avatar-wrapper, [component="avatar/picture"], img[component="avatar/picture"], .avatar, .user-icon')
          .first()
          .closest('.d-flex, .account-header, .profile-header, .user-profile-header, .ha-profile-header, .card, section, div');
      }
    }

    return {
      $account: $account,
      $top: $top
    };
  }

  function initXiaohongshuProfile($account, $top) {
    cleanupInjected();
    if (window.innerWidth > MOBILE_MAX) return;

    const dom = getDomCache($account, $top);
    if (!dom.$account.length || !dom.$top.length) return;

    // Keep the CSS placeholder visible until the replacement shell is fully built.
    // This prevents a one-frame flash of the original NodeBB profile.
    hideOriginalElements(dom);
    buildProfileShell(dom);
    tweakContentArea(dom);
    bindGlobalEvents();
    bindCoverUploadCompression(dom);
    hideGlobalNavigation();
  }

  function cleanupInjected() {
    cleanupInitWait();

    observers.forEach(function (obs) {
      try {
        obs.disconnect();
      } catch (e) {}
    });
    observers = [];

    $('#xhs-profile-shell, #xhs-profile-header, #xhs-profile-topmenu, #xhs-tab-nav, .xhs-injected').remove();

    $('.xhs-original-top-hidden').removeClass('xhs-original-top-hidden');
    $('.xhs-hidden').removeClass('xhs-hidden');
    $('.xhs-cover-raw').removeClass('xhs-cover-raw');
    $('.xhs-about-card').removeClass('xhs-about-card');
    $('.xhs-account-layout').removeClass('xhs-account-layout');

    $(document).off('.xhsProfile');
    $('.cover .upload').off('click.xhsProfileCoverCompress');
    removeCoverUploadCompressionListener();
  }

  function restoreGlobalUI() {
    $('[component="bottombar"]').show();
    $('.sidebar-left, .sidebar-right').show();
    $('main#panel').css({ 'margin-top': '', 'padding-top': '' });
    $('.layout-container').css({ 'padding-bottom': '' });
    $('body').removeClass('xhs-profile-active xhs-profile-candidate xhs-profile-failed');
    if (document.documentElement) {
      document.documentElement.classList.remove('xhs-profile-html-candidate');
    }
  }

  function getDomCache($account, $top) {
    return {
      $account: $account,
      $top: $top,
      $cover: $account.find('.cover[component="account/cover"]').first(),
      $avatarWrapper: $top.find('.avatar-wrapper').first(),
      $avatarImg: $top.find('.avatar-wrapper img[component="avatar/picture"]').first(),
      $infoCol: $top.find('.d-flex.flex-column.gap-1').first(),
      $fullname: $top.find('.fullname').first(),
      $username: $top.find('.username').first(),
      $originAction: $top.find('.flex-shrink-0.d-flex.gap-1.align-self-stretch.align-self-md-start.justify-content-end').first(),
      $sidebarNav: $account.find('.flex-shrink-0.pe-2.border-end-md.text-sm.mb-3.flex-basis-md-200').first(),
      $accountContent: $account.find('.account-content').first(),
      $stats: $account.find('.account-stats').first(),
      $coverUpload: $account.find('.cover .upload').first(),
      $coverResize: $account.find('.cover .resize').first(),
      $coverRemove: $account.find('.cover .remove').first(),
      $avatarChangeAnchor: $account.find('.avatar-wrapper a[component="profile/change/picture"]').first(),
      $avatarChangeWrap: $account.find('.avatar-wrapper[component="profile/change/picture"]').first(),
      $follow: $top.find('[component="account/follow"]').first(),
      $unfollow: $top.find('[component="account/unfollow"]').first(),
      $chat: $top.find('[component="account/chat"]').first(),
      $newChat: $top.find('[component="account/new-chat"]').first(),
      $flag: $account.find('[component="account/flag"]').first(),
      $alreadyFlagged: $account.find('[component="account/already-flagged"]').first(),
      $block: $account.find('[component="account/block"]').first(),
      $unblock: $account.find('[component="account/unblock"]').first(),
      $ban: $account.find('[component="account/ban"]').first(),
      $unban: $account.find('[component="account/unban"]').first(),
      $mute: $account.find('[component="account/mute"]').first(),
      $unmute: $account.find('[component="account/unmute"]').first(),
      $deleteAccount: $account.find('[component="account/delete-account"]').first(),
      $deleteContent: $account.find('[component="account/delete-content"]').first(),
      $deleteAll: $account.find('[component="account/delete-all"]').first()
    };
  }

  function getPathParts() {
    return location.pathname.split('/').filter(Boolean).map(function (part) {
      try {
        return decodeURIComponent(part);
      } catch (e) {
        return part;
      }
    });
  }

  function getViewedSlug() {
    const u = getProfileData();
    if (u.userslug) return String(u.userslug);

    const parts = getPathParts();
    const userIndex = parts.indexOf('user');

    if (userIndex !== -1 && parts[userIndex + 1]) {
      return parts[userIndex + 1];
    }

    return '';
  }

  function getCurrentSection() {
    const parts = getPathParts();
    const userIndex = parts.indexOf('user');

    if (userIndex !== -1 && parts[userIndex + 2]) {
      return parts[userIndex + 2];
    }

    return 'about';
  }

  function getRelativePath() {
    const cfg = window.config || {};
    const raw = cfg.relative_path || '';
    return String(raw || '').replace(/\/+$/, '');
  }

  function getUserPath(section) {
    const slug = encodeURIComponent(getViewedSlug());
    const suffix = section ? '/' + String(section).replace(/^\/+/, '') : '';
    return getRelativePath() + '/user/' + slug + suffix;
  }

  function getLang() {
    const candidates = [
      window.config && window.config.userLang,
      window.app && window.app.user && window.app.user.userLang,
      window.ajaxify && window.ajaxify.data && window.ajaxify.data.config && window.ajaxify.data.config.userLang,
      document.documentElement && document.documentElement.lang
    ].map(norm).filter(Boolean);

    const raw = (candidates[0] || 'zh-CN').replace('_', '-').toLowerCase();

    if (raw.indexOf('my') === 0 || raw.indexOf('mm') === 0 || raw.indexOf('burmese') === 0) return 'my-MM';
    if (raw.indexOf('zh') === 0 || raw.indexOf('cn') !== -1) return 'zh-CN';
    return 'en-GB';
  }

  function t(key) {
    const lang = getLang();
    return (I18N[lang] && I18N[lang][key]) || I18N['zh-CN'][key] || key;
  }

  function isOwnProfile() {
    const me = window.app && window.app.user;
    const slug = getViewedSlug();

    if (!me || !slug) return false;

    const current = String(slug).toLowerCase();
    const mySlug = String(me.userslug || '').toLowerCase();
    const myName = String(me.username || '').toLowerCase();

    return current === mySlug || current === myName;
  }

  function isAdminViewer() {
    const me = window.app && window.app.user;
    return !!(me && (me.isAdmin || me.isGlobalMod));
  }

  function isEditableSection() {
    return ['edit', 'settings', 'theme', 'info'].indexOf(getCurrentSection()) !== -1;
  }

  function getProfileData() {
    const d = window.ajaxify && window.ajaxify.data;
    if (!d) return {};
    if (d.username || d.userslug) return d;
    if (d.user && (d.user.username || d.user.userslug)) return d.user;
    return {};
  }

  function getDisplayName() {
    const u = getProfileData();
    return norm(u.fullname || u.displayname || u.username || '') ||
      norm($('.fullname').first().text()) ||
      norm($('.username').first().text()).replace(/^@/, '') ||
      getViewedSlug();
  }

  function getAvatarSrc() {
    const u = getProfileData();
    return normalizeSafeUrl(u.picture || u.uploadedpicture || '');
  }

  function getAvatarIcon() {
    const u = getProfileData();
    return {
      text: (u['icon:text'] || u.username || '?').charAt(0).toUpperCase(),
      bg: normalizeCssColor(u['icon:bgColor'] || '#795548')
    };
  }

  function getCoverUrl() {
    const u = getProfileData();
    return normalizeSafeUrl(u['cover:url'] || '');
  }

  function getBioText() {
    const u = getProfileData();
    return stripHtml(u.aboutme || u.signature || '');
  }

  function getGenderSymbol() {
    const u = getProfileData();
    const g = norm(u.gender).toLowerCase();
    if (!g) return '';
    if (g === '男' || /^m(ale)?$/.test(g)) return '♂';
    if (g === '女' || /^f(emale)?$/.test(g)) return '♀';
    return '';
  }

  function getAge() {
    const u = getProfileData();
    if (u.age) return String(u.age);
    if (!u.birthday) return '';

    const birth = new Date(u.birthday);
    if (isNaN(birth.getTime())) return '';

    const now = new Date();
    let y = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();

    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) y -= 1;

    return y > 0 ? String(y) : '';
  }

  function getCountryText() {
    const u = getProfileData();
    return norm(u.country || u.nationality || u.language_flag || '');
  }

  function getCountryFlagEmoji() {
    const raw = getCountryText();
    if (!raw) return '';

    const flagMatch = String(raw).match(/(?:\uD83C[\uDDE6-\uDDFF]){2}/);
    if (flagMatch) return flagMatch[0];

    const lower = raw.toLowerCase().trim();
    const upper = raw.toUpperCase().trim();

    const isoMap = {
      MM: '🇲🇲', CN: '🇨🇳', SG: '🇸🇬', TH: '🇹🇭', LA: '🇱🇦',
      VN: '🇻🇳', KH: '🇰🇭', MY: '🇲🇾', PH: '🇵🇭', JP: '🇯🇵',
      KR: '🇰🇷', US: '🇺🇸', GB: '🇬🇧', UK: '🇬🇧', FR: '🇫🇷',
      DE: '🇩🇪', IN: '🇮🇳'
    };

    if (isoMap[upper]) return isoMap[upper];

    const pairs = [
      ['缅甸', '🇲🇲'], ['myanmar', '🇲🇲'], ['burma', '🇲🇲'],
      ['中国', '🇨🇳'], ['china', '🇨🇳'],
      ['新加坡', '🇸🇬'], ['singapore', '🇸🇬'],
      ['泰国', '🇹🇭'], ['thailand', '🇹🇭'],
      ['老挝', '🇱🇦'], ['laos', '🇱🇦'],
      ['越南', '🇻🇳'], ['vietnam', '🇻🇳'],
      ['柬埔寨', '🇰🇭'], ['cambodia', '🇰🇭'],
      ['马来西亚', '🇲🇾'], ['malaysia', '🇲🇾'],
      ['菲律宾', '🇵🇭'], ['philippines', '🇵🇭'],
      ['日本', '🇯🇵'], ['japan', '🇯🇵'],
      ['韩国', '🇰🇷'], ['korea', '🇰🇷'], ['south korea', '🇰🇷'],
      ['美国', '🇺🇸'], ['usa', '🇺🇸'], ['united states', '🇺🇸'],
      ['英国', '🇬🇧'], ['uk', '🇬🇧'], ['united kingdom', '🇬🇧'],
      ['法国', '🇫🇷'], ['france', '🇫🇷'],
      ['德国', '🇩🇪'], ['germany', '🇩🇪'],
      ['印度', '🇮🇳'], ['india', '🇮🇳']
    ];

    for (let i = 0; i < pairs.length; i += 1) {
      if (lower.indexOf(pairs[i][0]) !== -1) return pairs[i][1];
    }

    return '';
  }

  function getLanguagePairInfo() {
    const u = getProfileData();

    function parse(v) {
      if (Array.isArray(v)) return v.filter(Boolean);

      const s = String(v || '').trim();
      if (!s || s === '[]') return [];

      try {
        const p = JSON.parse(s);
        if (Array.isArray(p)) return p.filter(Boolean);
      } catch (e) {}

      return s.split(/[\/,、|]+/).map(norm).filter(Boolean);
    }

    function toCode(v) {
      const r = norm(v).toLowerCase();
      const map = {
        '中文': 'ZH', '汉语': 'ZH', '普通话': 'ZH', 'chinese': 'ZH', 'mandarin': 'ZH',
        '英语': 'EN', '英文': 'EN', 'english': 'EN',
        '缅甸语': 'MY', '缅语': 'MY', '缅文': 'MY', 'burmese': 'MY', 'myanmar': 'MY',
        '日语': 'JA', 'japanese': 'JA',
        '韩语': 'KO', 'korean': 'KO',
        '泰语': 'TH', 'thai': 'TH',
        '越南语': 'VI', 'vietnamese': 'VI',
        '法语': 'FR', 'french': 'FR',
        '德语': 'DE', 'german': 'DE',
        '西班牙语': 'ES', 'spanish': 'ES',
        '老挝语': 'LO', 'lao': 'LO',
        '高棉语': 'KM', 'khmer': 'KM',
        '马来语': 'MS', 'malay': 'MS',
        '菲律宾语': 'TL', 'tagalog': 'TL'
      };

      if (map[r]) return map[r];
      if (/^[a-z]{2,4}$/i.test(r)) return r.toUpperCase();
      return norm(v).slice(0, 3).toUpperCase();
    }

    const native = [].concat(
      parse(u.language_fluent),
      parse(u.native_language),
      parse(u.language_native)
    );

    const learn = [].concat(
      parse(u.language_learning),
      parse(u.learning_language),
      parse(u.language_target)
    );

    const nativeText = unique(native.map(toCode).filter(Boolean)).join('/');
    const learnText = unique(learn.map(toCode).filter(Boolean)).join('/');

    return {
      nativeText: nativeText,
      learnText: learnText,
      text: nativeText && learnText
        ? nativeText + ' ⇄ ' + learnText
        : (nativeText || learnText || '')
    };
  }

  function renderLanguagePairHtml(info) {
    if (!info || !info.text) return '';

    if (info.nativeText && info.learnText) {
      return (
        '<span class="xhs-lang-part">' + esc(info.nativeText) + '</span>' +
        '<span class="xhs-lang-arrow" aria-hidden="true">⇄</span>' +
        '<span class="xhs-lang-part">' + esc(info.learnText) + '</span>'
      );
    }

    return '<span class="xhs-lang-part">' + esc(info.text) + '</span>';
  }

  function pickStat(keys) {
    const u = getProfileData();

    for (let i = 0; i < keys.length; i += 1) {
      if (u[keys[i]] !== undefined && u[keys[i]] !== null) return String(u[keys[i]]);
    }

    return '0';
  }

  function getFollowingCount() {
    return pickStat(['followingCount', 'following', 'followings']);
  }

  function getFollowersCount() {
    return pickStat(['followerCount', 'followers', 'followersCount']);
  }

  function getViewsCount() {
    return pickStat(['profileviews', 'profileViews', 'views']);
  }

  function hideGlobalNavigation() {
    $('body').addClass('xhs-profile-active').removeClass('xhs-profile-candidate xhs-profile-failed');
    if (document.documentElement) {
      document.documentElement.classList.remove('xhs-profile-html-candidate');
    }
  }

  function hideOriginalElements(dom) {
    dom.$top.addClass('xhs-original-top-hidden');
    dom.$sidebarNav.addClass('xhs-hidden');
    dom.$originAction.addClass('xhs-hidden');
    dom.$cover.addClass('xhs-cover-raw');

    const $layoutRow = dom.$sidebarNav.parent();
    if ($layoutRow.length) {
      $layoutRow.addClass('xhs-account-layout');
    }
  }

  function buildProfileShell(dom) {
    const displayName = getDisplayName();
    const avatarSrc = getAvatarSrc();
    const icon = getAvatarIcon();
    const coverUrl = getCoverUrl();
    const bio = getBioText();
    const gender = getGenderSymbol();
    const age = getAge();
    const langInfo = getLanguagePairInfo();
    const country = getCountryText();
    const avatarFlag = getCountryFlagEmoji();
    const bioIsMyanmar = containsMyanmar(bio);
    const nameIsMyanmar = containsMyanmar(displayName);

    let avatarHtml;
    if (avatarSrc) {
      avatarHtml = '<img class="xhs-avatar-img" src="' + esc(avatarSrc) + '" alt="' + esc(displayName) + '">';
    } else {
      avatarHtml = '<div class="xhs-avatar-fallback" style="background:' + esc(icon.bg) + '">' + esc(icon.text) + '</div>';
    }

    let uploadAvatarHtml = '';
    if (isOwnProfile()) {
      uploadAvatarHtml =
        '<button type="button" class="xhs-avatar-upload-btn" id="xhsAvatarUploadBtn" aria-label="' + esc(t('uploadAvatar')) + '">' +
          '<i class="fa fa-camera"></i>' +
        '</button>';
    }

    const avatarFlagHtml = avatarFlag
      ? '<span class="xhs-avatar-flag">' + avatarFlag + '</span>'
      : '';

    let genderAgeHtml = '';
    if (gender || age) {
      const gaText = [gender, age ? age + t('yearsOld') : ''].filter(Boolean).join(' ');
      genderAgeHtml = '<span class="xhs-gender-tag">' + esc(gaText) + '</span>';
    }

    const langHtml = langInfo.text
      ? '<div class="xhs-language-line' + (containsMyanmar(langInfo.text) ? ' xhs-mm-text' : '') + '">' + renderLanguagePairHtml(langInfo) + '</div>'
      : '';

    const countryHtml = country
      ? '<div class="xhs-country-line' + (containsMyanmar(country) ? ' xhs-mm-text' : '') + '"><i class="fa fa-map-marker-alt"></i><span>' + esc(country) + '</span></div>'
      : '';

    const bioHtml = bio
      ? '<div class="xhs-bio' + (bioIsMyanmar ? ' xhs-mm-bio' : '') + '">' + esc(bio) + '</div>'
      : '';

    const headerClasses = ['xhs-injected'];
    if (!bio) headerClasses.push('xhs-no-bio');

    const $shell = $('<div id="xhs-profile-shell" class="xhs-injected"></div>');
    const $header = $(
      '<div id="xhs-profile-header" class="' + headerClasses.join(' ') + '">' +
        '<div class="xhs-cover"></div>' +
        '<div class="xhs-cover-shade"></div>' +
        '<div class="xhs-header-overlay">' +
          '<div class="xhs-user-main">' +
            '<div class="xhs-avatar-wrap">' +
              '<div class="xhs-avatar-circle">' + avatarHtml + '</div>' +
              avatarFlagHtml +
              uploadAvatarHtml +
            '</div>' +
            '<div class="xhs-user-right">' +
              '<div class="xhs-name-row">' +
                '<span class="xhs-display-name' + (nameIsMyanmar ? ' xhs-mm-name' : '') + '">' + esc(displayName) + '</span>' +
                genderAgeHtml +
              '</div>' +
              langHtml +
              countryHtml +
            '</div>' +
          '</div>' +
          bioHtml +
        '</div>' +
      '</div>'
    );

    if (coverUrl && coverUrl.indexOf('cover-default') === -1) {
      $header.find('.xhs-cover').css('background-image', 'url("' + cssUrlEscape(coverUrl) + '")');
    } else {
      $header.find('.xhs-cover').css('background', 'linear-gradient(135deg, #ff826d 0%, #ff2442 48%, #d81b60 100%)');
    }

    dom.$top.before($shell);
    $shell.append($header);

    buildStatsRow($header);
    buildActionButtons(dom, $header);
    buildTopMenu(dom, $header);
    buildTabNav($shell);

    if (isOwnProfile()) {
      $('#xhsAvatarUploadBtn').on('click', function (e) {
        e.preventDefault();
        triggerAvatarUpload(dom);
      });
    }
  }

  function buildStatsRow($header) {
    const stats = [
      { num: getFollowingCount(), label: t('follow'), href: getUserPath('following') },
      { num: getFollowersCount(), label: t('followers'), href: getUserPath('followers') },
      { num: getViewsCount(), label: t('views'), href: '' }
    ];

    const $row = $('<div id="xhs-stats-row" class="xhs-injected"></div>');

    stats.forEach(function (s) {
      const tag = s.href ? 'a' : 'div';
      const hrefAttr = s.href ? ' href="' + s.href + '"' : '';
      $row.append(
        '<' + tag + ' class="xhs-stat-item"' + hrefAttr + '>' +
          '<span class="xhs-stat-num">' + esc(s.num) + '</span>' +
          '<span class="xhs-stat-label">' + esc(s.label) + '</span>' +
        '</' + tag + '>'
      );
    });

    $header.find('.xhs-header-overlay').append($row);
  }

  function buildActionButtons(dom, $header) {
    const own = isOwnProfile();
    const editable = isEditableSection();
    const $bar = $('<div id="xhs-action-bar" class="xhs-injected"></div>');

    if (own) {
      if (editable) {
        $bar.append($('<a href="' + getUserPath() + '" class="xhs-btn xhs-btn-outline xhs-btn-long">' + esc(t('backProfile')) + '</a>'));
      } else {
        $bar.append($('<a href="' + getUserPath('edit') + '" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(t('editProfile')) + '</a>'));
      }
    } else {
      const $followSlot = $('<div class="xhs-btn-slot xhs-btn-long-slot"></div>');
      mirrorFollowState($followSlot, dom.$follow, dom.$unfollow);
      $bar.append($followSlot);

      const $chatSource = dom.$chat.length ? dom.$chat : dom.$newChat;
      if ($chatSource.length) {
        const $chatBtn = $('<button type="button" class="xhs-btn xhs-btn-outline xhs-btn-long">' + esc(t('chat')) + '</button>');
        $chatBtn.on('click', function (e) {
          e.preventDefault();
          $chatSource.get(0).click();
        });
        $bar.append($chatBtn);
      }
    }

    $header.find('.xhs-header-overlay').append($bar);
  }

  function buildTopMenu(dom, $header) {
    const own = isOwnProfile();
    const admin = isAdminViewer();
    const $wrap = $('<div id="xhs-profile-topmenu" class="xhs-injected"></div>');
    const $menuWrap = $('<div class="xhs-menu-wrap xhs-topmenu-wrap"></div>');
    const $btn = $('<button type="button" class="xhs-topmenu-btn" aria-label="' + esc(t('more')) + '"><i class="fa fa-ellipsis-h"></i></button>');
    const $menu = $('<div class="xhs-dropdown-menu xhs-topmenu-dropdown" id="xhs-topmenu-dropdown"></div>');

    if (own) {
      addMenuLink($menu, getUserPath('settings'), 'fa-cog', t('settings'));
      addMenuLink($menu, getUserPath('theme'), 'fa-paint-brush', t('themeSettings'));
      addMenuDivider($menu);
      addMenuCustomAction($menu, 'fa-camera', t('uploadAvatar'), function () {
        triggerAvatarUpload(dom);
      });
      if (dom.$coverUpload.length) {
        addMenuCustomAction($menu, 'fa-image', t('uploadCover'), function () {
          triggerCoverUpload(dom);
        });
      }
      addMenuAction($menu, dom.$coverResize, 'fa-arrows-alt', t('resizeCover'));
      addMenuAction($menu, dom.$coverRemove, 'fa-trash', t('removeCover'));
    } else {
      if (admin) {
        addMenuLink($menu, getUserPath('info'), 'fa-id-card', t('accountInfo'));
        addMenuMirrorButtons($menu, dom.$mute, dom.$unmute, 'fa-volume-mute', t('muteAccount'), t('unmuteAccount'));
        addMenuMirrorButtons($menu, dom.$ban, dom.$unban, 'fa-ban', t('banAccount'), t('unbanAccount'));
        addMenuAction($menu, dom.$deleteAccount, 'fa-trash', t('deleteAccount'));
        addMenuAction($menu, dom.$deleteContent, 'fa-eraser', t('deleteContent'));
        addMenuAction($menu, dom.$deleteAll, 'fa-bomb', t('deleteAll'));
        addMenuDivider($menu);
      }

      addMenuMirrorButtons($menu, dom.$flag, dom.$alreadyFlagged, 'fa-flag', t('flagProfile'), t('alreadyFlagged'));
      addMenuMirrorButtons($menu, dom.$block, dom.$unblock, 'fa-eye-slash', t('blockUser'), t('unblockUser'));
    }

    $btn.on('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      $('.xhs-dropdown-menu').not($menu).removeClass('show');
      $menu.toggleClass('show');
    });

    $menuWrap.append($btn, $menu);
    $wrap.append($menuWrap);
    $header.append($wrap);
  }

  function buildTabNav($shell) {
    const section = getCurrentSection();
    const primaryTabs = [
      { key: 'about', label: t('home'), href: getUserPath() },
      { key: 'topics', label: t('notes'), href: getUserPath('topics') }
    ];

    const $nav = $('<div id="xhs-tab-nav" class="xhs-injected"></div>');
    const $scroll = $('<div class="xhs-tab-scroll"></div>');

    primaryTabs.forEach(function (tab) {
      const active = isTabActive(section, tab.key) ? ' active' : '';
      $scroll.append('<a href="' + tab.href + '" class="xhs-tab' + active + '">' + esc(tab.label) + '</a>');
    });

    $nav.append($scroll);
    $shell.append($nav);
  }

  function isTabActive(section, key) {
    if (key === 'about' && section === 'about') return true;
    return section === key;
  }

  function mirrorFollowState($slot, $follow, $unfollow) {
    function render() {
      $slot.empty();

      const followHidden = isHidden($follow);
      const unfollowHidden = isHidden($unfollow);

      let $btn = null;

      if (!followHidden && $follow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(t('follow')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      } else if (!unfollowHidden && $unfollow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-outline-muted xhs-btn-long">' + esc(t('following')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $unfollow.get(0).click();
        });
      } else if ($follow.length) {
        $btn = $('<button type="button" class="xhs-btn xhs-btn-primary xhs-btn-long">' + esc(t('follow')) + '</button>');
        $btn.on('click', function (e) {
          e.preventDefault();
          $follow.get(0).click();
        });
      }

      if ($btn) $slot.append($btn);
    }

    render();

    const obs = new MutationObserver(render);
    $follow.add($unfollow).each(function () {
      obs.observe(this, { attributes: true, attributeFilter: ['class', 'style', 'disabled', 'aria-hidden'] });
    });
    observers.push(obs);
  }

  function addMenuLink($menu, href, icon, text) {
    $menu.append(
      '<a href="' + href + '" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</a>'
    );
  }

  function addMenuCustomAction($menu, icon, text, fn) {
    const $item = $(
      '<button type="button" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );

    $item.on('click', function (e) {
      e.preventDefault();
      $('.xhs-dropdown-menu').removeClass('show');
      fn();
    });

    $menu.append($item);
  }

  function addMenuDivider($menu) {
    $menu.append('<div class="xhs-menu-divider"></div>');
  }

  function addMenuAction($menu, $source, icon, text) {
    if (!$source || !$source.length) return;

    const $item = $(
      '<button type="button" class="xhs-menu-item">' +
        '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(text) + '</span>' +
      '</button>'
    );

    $item.on('click', function (e) {
      e.preventDefault();
      $('.xhs-dropdown-menu').removeClass('show');
      $source.get(0).click();
    });

    $menu.append($item);
  }

  function addMenuMirrorButtons($menu, $a, $b, icon, textA, textB) {
    if ((!$a || !$a.length) && (!$b || !$b.length)) return;

    const $wrapper = $('<div class="xhs-menu-mirror-slot"></div>');

    function render() {
      $wrapper.empty();

      const aHidden = isHidden($a);
      const bHidden = isHidden($b);

      let $target = null;
      let label = '';

      if (!aHidden && $a.length) {
        $target = $a;
        label = textA;
      } else if (!bHidden && $b.length) {
        $target = $b;
        label = textB;
      } else if ($a.length) {
        $target = $a;
        label = textA;
      }

      if (!$target) return;

      const $item = $(
        '<button type="button" class="xhs-menu-item">' +
          '<i class="fa fa-fw ' + icon + '"></i><span>' + esc(label) + '</span>' +
        '</button>'
      );

      $item.on('click', function (e) {
        e.preventDefault();
        $('.xhs-dropdown-menu').removeClass('show');
        $target.get(0).click();
      });

      $wrapper.append($item);
    }

    render();

    const obs = new MutationObserver(render);
    $a.add($b).each(function () {
      obs.observe(this, { attributes: true, attributeFilter: ['class', 'style', 'disabled', 'aria-hidden'] });
    });
    observers.push(obs);

    $menu.append($wrapper);
  }

  function isHidden($el) {
    if (!$el || !$el.length) return true;
    return $el.hasClass('hide') ||
      $el.hasClass('hidden') ||
      $el.attr('aria-hidden') === 'true' ||
      $el.css('display') === 'none';
  }

  function triggerAvatarUpload(dom) {
    const $anchor = dom.$avatarChangeAnchor;
    const $wrap = dom.$avatarChangeWrap;

    if ($anchor && $anchor.length) {
      $anchor.get(0).click();
      return;
    }

    if ($wrap && $wrap.length) {
      $wrap.get(0).click();
    }
  }

  function triggerCoverUpload(dom) {
    const $source = dom && dom.$coverUpload;

    if (!$source || !$source.length) return;

    armCoverUploadCompression();
    $source.get(0).click();
  }

  function bindCoverUploadCompression(dom) {
    ensureCoverUploadCompressionListener();

    if (!dom || !dom.$coverUpload || !dom.$coverUpload.length) return;

    dom.$coverUpload
      .off('click.xhsProfileCoverCompress')
      .on('click.xhsProfileCoverCompress', function () {
        armCoverUploadCompression();
      });
  }

  function ensureCoverUploadCompressionListener() {
    if (coverUploadCompressionBound || !document.addEventListener) return;

    document.addEventListener('change', handleCoverUploadFileChange, true);
    coverUploadCompressionBound = true;
  }

  function removeCoverUploadCompressionListener() {
    coverUploadArmedUntil = 0;

    if (!coverUploadCompressionBound || !document.removeEventListener) return;

    document.removeEventListener('change', handleCoverUploadFileChange, true);
    coverUploadCompressionBound = false;
  }

  function armCoverUploadCompression() {
    coverUploadArmedUntil = Date.now() + IMAGE_CONFIG.coverUploadArmMs;
  }

  function isCoverUploadArmed() {
    return coverUploadArmedUntil && Date.now() <= coverUploadArmedUntil;
  }

  function handleCoverUploadFileChange(e) {
    if (!isAccountPage() || window.innerWidth > MOBILE_MAX) {
      coverUploadArmedUntil = 0;
      return;
    }

    const input = e.target;

    if (!input || input.type !== 'file') return;

    if (input.getAttribute('data-xhs-cover-compressed') === '1') {
      input.removeAttribute('data-xhs-cover-compressed');
      coverUploadArmedUntil = 0;
      return;
    }

    const armed = isCoverUploadArmed();
    if (!armed && !looksLikeCoverFileInput(input)) return;

    const file = input.files && input.files[0];
    if (!file) {
      coverUploadArmedUntil = 0;
      return;
    }

    if (!canReplaceInputFiles() || !shouldTryCompressImage(file)) {
      coverUploadArmedUntil = 0;
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    if (typeof e.stopImmediatePropagation === 'function') {
      e.stopImmediatePropagation();
    }

    coverUploadArmedUntil = 0;

    compressImage(file)
      .then(function (nextFile) {
        if (nextFile && nextFile !== file) {
          replaceInputFiles(input, nextFile);
        }

        input.setAttribute('data-xhs-cover-compressed', '1');
        dispatchNativeChange(input);
      })
      .catch(function (err) {
        warn('背景图压缩失败，已改用原图上传', err);
        input.setAttribute('data-xhs-cover-compressed', '1');
        dispatchNativeChange(input);
      });
  }

  function looksLikeCoverFileInput(input) {
    if (!input) return false;

    const $input = $(input);
    const attrs = [
      input.name,
      input.id,
      input.className,
      input.getAttribute('component'),
      input.getAttribute('data-component'),
      input.getAttribute('aria-label'),
      input.getAttribute('accept')
    ].join(' ').toLowerCase();

    if (attrs.indexOf('cover') !== -1 || attrs.indexOf('background') !== -1) return true;
    return !!$input.closest('.cover, [component="account/cover"]').length;
  }

  function shouldTryCompressImage(file) {
    if (!file || !file.type || !/^image\//i.test(file.type)) return false;
    if (/image\/(gif|svg\+xml)/i.test(file.type)) return false;
    return file.size >= IMAGE_CONFIG.minCompressBytes;
  }

  function canReplaceInputFiles() {
    try {
      return typeof DataTransfer !== 'undefined' && !!new DataTransfer().items;
    } catch (e) {
      return false;
    }
  }

  function replaceInputFiles(input, file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
  }

  function dispatchNativeChange(input) {
    let event;

    if (typeof Event === 'function') {
      event = new Event('change', { bubbles: true });
    } else {
      event = document.createEvent('Event');
      event.initEvent('change', true, false);
    }

    input.dispatchEvent(event);
  }

  async function compressImage(file) {
    try {
      if (!shouldTryCompressImage(file)) return file;

      const targetMime = getImageOutputMime(file);
      const targetName = withImageExtension(file.name, targetMime);

      let result = await compressImageWithLibrary(file, targetMime, targetName);
      if (!result) {
        result = await compressImageWithCanvas(file, targetMime, targetName);
      }

      if (!result || result.size >= file.size * IMAGE_CONFIG.beneficialRatio) {
        return file;
      }

      return result;
    } catch (e) {
      warn('图片压缩异常，已返回原图', e);
      return file;
    }
  }

  async function compressImageWithLibrary(file, targetMime, targetName) {
    if (typeof window.imageCompression !== 'function') return null;

    try {
      const compressed = await window.imageCompression(file, {
        maxSizeMB: IMAGE_CONFIG.maxSizeMB,
        maxWidthOrHeight: IMAGE_CONFIG.maxWidthOrHeight,
        initialQuality: IMAGE_CONFIG.initialQuality,
        useWebWorker: true,
        preserveExif: IMAGE_CONFIG.preserveExif,
        fileType: targetMime
      });

      if (!compressed || !compressed.size) return null;
      return blobToFile(compressed, targetName, targetMime, file.lastModified);
    } catch (e) {
      warn('第三方图片压缩库不可用，改用 Canvas 压缩', e);
      return null;
    }
  }

  async function compressImageWithCanvas(file, targetMime, targetName) {
    const img = await loadImage(file);
    const size = getCanvasTargetSize(img.width || img.naturalWidth, img.height || img.naturalHeight);

    if (!size.width || !size.height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (targetMime === 'image/jpeg') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let bestBlob = null;

    for (let i = 0; i < IMAGE_CONFIG.canvasQualities.length; i += 1) {
      const quality = IMAGE_CONFIG.canvasQualities[i];
      const blob = await canvasToBlob(canvas, targetMime, quality);

      if (!blob || !blob.size) continue;

      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
      }

      if (blob.size <= IMAGE_CONFIG.targetBytes) {
        bestBlob = blob;
        break;
      }
    }

    if (!bestBlob) return null;
    return blobToFile(bestBlob, targetName, targetMime, file.lastModified);
  }

  function getCanvasTargetSize(width, height) {
    const maxSide = Math.max(width, height);
    const limit = IMAGE_CONFIG.maxWidthOrHeight;

    if (!maxSide || maxSide <= limit) {
      return { width: width, height: height };
    }

    const ratio = limit / maxSide;

    return {
      width: Math.max(1, Math.round(width * ratio)),
      height: Math.max(1, Math.round(height * ratio))
    };
  }

  function loadImage(file) {
    return new Promise(function (resolve, reject) {
      const url = URL.createObjectURL(file);
      const img = new Image();

      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('图片读取失败'));
      };

      img.src = url;
    });
  }

  function canvasToBlob(canvas, mime, quality) {
    return new Promise(function (resolve) {
      if (canvas.toBlob) {
        canvas.toBlob(function (blob) {
          resolve(blob);
        }, mime, quality);
        return;
      }

      try {
        const dataUrl = canvas.toDataURL(mime, quality);
        resolve(dataUrlToBlob(dataUrl));
      } catch (e) {
        resolve(null);
      }
    });
  }

  function dataUrlToBlob(dataUrl) {
    const parts = String(dataUrl || '').split(',');
    const header = parts[0] || '';
    const body = parts[1] || '';
    const mimeMatch = header.match(/data:([^;]+)/);
    const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    const binary = atob(body);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Blob([bytes], { type: mime });
  }

  function getImageOutputMime(file) {
    if (IMAGE_CONFIG.useWebp && canEncode('image/webp')) {
      return 'image/webp';
    }

    if (canEncode('image/jpeg')) {
      return 'image/jpeg';
    }

    return file.type || 'image/jpeg';
  }

  function canEncode(mime) {
    if (encodeSupportCache[mime] !== undefined) return encodeSupportCache[mime];

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      encodeSupportCache[mime] = canvas.toDataURL(mime).indexOf('data:' + mime) === 0;
    } catch (e) {
      encodeSupportCache[mime] = false;
    }

    return encodeSupportCache[mime];
  }

  function withImageExtension(name, mime) {
    const clean = String(name || 'cover').replace(/\.[^.]+$/, '');
    const ext = mime === 'image/webp' ? '.webp' : '.jpg';
    return clean + ext;
  }

  function blobToFile(blob, name, mime, lastModified) {
    const options = {
      type: mime || blob.type || 'image/jpeg',
      lastModified: lastModified || Date.now()
    };

    try {
      return new File([blob], name, options);
    } catch (e) {
      blob.name = name;
      blob.lastModified = options.lastModified;
      return blob;
    }
  }

  function tweakContentArea(dom) {
    const section = getCurrentSection();
    const editable = isEditableSection();

    if (!editable) {
      dom.$accountContent.children('.d-flex.justify-content-between.align-items-center.mb-3').addClass('xhs-hidden');
    }

    if (section === 'about') {
      const bio = getBioText().trim();
      if (bio) {
        dom.$accountContent.children().each(function () {
          const $el = $(this);
          if ($el.hasClass('account-stats')) return false;

          const txt = norm($el.text());
          if (txt === bio || txt.indexOf('关于我') !== -1 || txt.toLowerCase().indexOf('about me') !== -1) {
            $el.addClass('xhs-hidden');
          }
        });
      }
    }

    dom.$stats.find('.card').addClass('xhs-about-card');
  }

  function bindGlobalEvents() {
    $(document).off('.xhsProfile');

    $(document).on('click.xhsProfile', function (e) {
      if (!$(e.target).closest('.xhs-menu-wrap').length) {
        $('.xhs-dropdown-menu').removeClass('show');
      }
    });
  }

  function norm(str) {
    return String(str || '').replace(/\s+/g, ' ').trim();
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function stripHtml(str) {
    const div = document.createElement('div');
    div.innerHTML = String(str || '');
    return norm(div.textContent || div.innerText || '');
  }

  function unique(arr) {
    return Array.from(new Set(arr));
  }

  function containsMyanmar(str) {
    return /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/.test(String(str || ''));
  }

  function normalizeSafeUrl(url) {
    const raw = String(url || '').trim();

    if (!raw) return '';
    if (/^(javascript|data|vbscript):/i.test(raw)) return '';

    try {
      return new URL(raw, window.location.origin).href;
    } catch (e) {
      return '';
    }
  }

  function normalizeCssColor(value) {
    const raw = String(value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(raw)) return raw;
    if (/^rgba?\([\d\s,%.]+\)$/i.test(raw)) return raw;
    if (/^hsla?\([\d\s,%.deg]+\)$/i.test(raw)) return raw;
    return '#795548';
  }

  function cssUrlEscape(url) {
    return String(url || '').replace(/["\\\n\r\f]/g, '\\$&');
  }

  function warn(message, err) {
    if (!window.console || typeof window.console.warn !== 'function') return;
    window.console.warn('[peipe-xhs-profile]', message, err || '');
  }
})();
