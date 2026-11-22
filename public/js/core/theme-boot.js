// Applied before the page paints, so night mode and the palette do not flash.
(function () {
    try {
        if (localStorage.getItem('hp.dark') === '1') document.documentElement.classList.add('dark');
        var p = localStorage.getItem('hp.palette');
        if (p) { document.documentElement.style.setProperty('--color-primary', p); document.documentElement.style.setProperty('--color-primary-hover', p); }
        if (localStorage.getItem('hp.lang') === 'ur') { document.documentElement.dir = 'rtl'; document.documentElement.lang = 'ur'; }
    } catch (e) { /* storage blocked: defaults */ }
})();
