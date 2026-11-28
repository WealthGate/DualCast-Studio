module.exports = async function verifyHardwareSettings(primary, hardware) {
  return primary.webContents.executeJavaScript(`(async () => {
    const { default: React } = await import('/@fs/' + ${JSON.stringify(process.cwd().replace(/\\/g, '/'))} + '/node_modules/.vite/deps/react.js');
    const { default: ReactDOM } = await import('/@fs/' + ${JSON.stringify(process.cwd().replace(/\\/g, '/'))} + '/node_modules/.vite/deps/react-dom_client.js');
    const { default: SettingsPanel } = await import('/components/SettingsPanel.tsx');
    const { useAppStore: store } = await import('/store/useAppStore.ts');
    const { supports8KEncoding } = await import('/hooks/use8KSupport.ts');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const settings = store.getState().settings, getHardware = window.dualcast.getHardwareCapabilities;
    window.dualcast.getHardwareCapabilities = async () => (${JSON.stringify(hardware)});
    const container = document.createElement('div'); document.body.append(container);
    const root = ReactDOM.createRoot(container); root.render(React.createElement(SettingsPanel));
    try {
      for(let i=0;i<100&&!container.querySelector('#hardwareStreamEncoder');i++) await wait(20);
      await wait(300);
      const assert = (value, message) => { if(!value) throw Error(message); };
      const gpu = container.querySelector('#graphicsMode');
      assert(gpu && gpu.options.length === 4, 'Graphics preference controls missing');
      gpu.value = 'high-performance'; gpu.dispatchEvent(new Event('change', { bubbles: true })); await wait(150);
      assert(store.getState().settings.graphicsMode === 'high-performance', 'Graphics selection was not saved');
      assert(container.textContent.includes('Restart the app'), 'Restart guidance missing');
      const stream = container.querySelector('#hardwareStreamEncoder');
      for(const option of stream.options) if(option.value !== 'auto') assert(option.disabled === !${JSON.stringify(hardware.streamEncoders)}.includes(option.value), 'Unavailable encoder was offered: '+option.value);
      const support = await supports8KEncoding(settings.frameRate);
      for(const id of ['outputResolution', 'displayResolution']) {
        const options = [...container.querySelector('#'+id).options];
        assert(options.some(option => option.value === '4k'), '4K choice missing');
        assert(options.find(option => option.value === '8k').disabled === !support, '8K capability gate incorrect');
      }
      return { devices: ${JSON.stringify(hardware.devices)}, encoders: ${JSON.stringify(hardware.streamEncoders)}, graphicsPreferenceSaved: true, unsupportedEncodersDisabled: true, eightKHardwareAvailable: support, resolutionControls: true };
    } finally {
      root.unmount(); container.remove(); window.dualcast.getHardwareCapabilities = getHardware;
      await wait(150); store.setState({ settings });
    }
  })()`);
};
