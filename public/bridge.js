(function () {
  try {
    if (!window.Capacitor || !window.Capacitor.Plugins) return;

    // Zebra printing
    const zebra = window.Capacitor.Plugins.ZebraBridge;
    if (zebra) {
      window.ZebraBridge = {
        listPaired: () => zebra.listPaired(),
        printZpl: ({ address, zpl }) => zebra.printZpl({ address, zpl })
      };
      console.log("[bridge] ZebraBridge ready");
    } else {
      console.log("[bridge] ZebraBridge plugin missing.");
    }

    // Scan intents
    const scan = window.Capacitor.Plugins.ScanBridge;
    if (scan) {
      window.ScanBridge = {
        // Optional: lock to a single action/extraKey if you later decide to set PM85 to Custom Intent once
        configure: (opts) => scan.configure(opts || {}),
        // Listener helper
        addListener: (cb) => scan.addListener("scan", cb)
      };
      console.log("[bridge] ScanBridge ready");
    } else {
      console.log("[bridge] ScanBridge plugin missing.");
    }
  } catch (e) {
    console.log("[bridge] init failed", e);
  }
})();
