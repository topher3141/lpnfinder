(function () {
  try {
    // Helpful debug so we know the file loaded at all
    console.log("[bridge] loaded", {
      hasCapacitor: !!window.Capacitor,
      hasPlugins: !!window.Capacitor?.Plugins,
      keys: Object.keys(window.Capacitor?.Plugins || {})
    });

    const cap = window.Capacitor;
    if (!cap) return;

    // Capacitor 8: usually cap.Plugins, but keep fallback
    const plugins = cap.Plugins || (cap).plugins || {};
    const plugin = plugins.ZebraBridge;

    if (!plugin) {
      console.log("[bridge] ZebraBridge plugin missing. Available:", Object.keys(plugins || {}));
      return;
    }

    window.ZebraBridge = {
      listPaired: () => plugin.listPaired(),
      printZpl: ({ address, zpl }) => plugin.printZpl({ address, zpl })
    };

    console.log("[bridge] ZebraBridge ready");
  } catch (e) {
    console.log("[bridge] init failed", e);
  }
})();
