import log from "electron-log";

export const setupLogging = () => {
  log.initialize();
  log.transports.file.level = "info";
  log.transports.console.level = "debug";
};

export default log;
