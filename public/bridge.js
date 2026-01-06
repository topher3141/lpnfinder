(function () {
  try {
    // Capacitor injects window.Capacitor in native builds
    if (!window.Capacitor || !window.Capacitor.Plugins) return;

    const plugin = window.Capacitor.Plugins.ZebraBridge;
    if (!plugin) return;

    // Expose a simple global your app already expects
    window.ZebraBridge = {
      listPaired: () => plugin.listPaired(),
      printZpl: ({ address, zpl }) => plugin.printZpl({ address, zpl })
    };

    console.log("[bridge] ZebraBridge ready");
  } catch (e) {
    console.log("[bridge] init failed", e);
  }
})();
