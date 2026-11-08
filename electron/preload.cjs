const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('load-data'),
  pickExcelFiles: () => ipcRenderer.invoke('pick-excel-files'),
  importFiles: (items) => ipcRenderer.invoke('import-files', items),
});
