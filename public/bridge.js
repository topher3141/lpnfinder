(function () {
  if (!window.Capacitor || !window.Capacitor.Plugins) return;

  const plugin = window.Capacitor.Plugins.ZebraBridge;
  if (!plugin) return;

  window.ZebraBridge = {
    listPaired: () => plugin.listPaired(),
    printZpl: ({ address, zpl }) => plugin.printZpl({ address, zpl }),
  };
})();
