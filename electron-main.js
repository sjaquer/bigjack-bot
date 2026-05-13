const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');

// --- INTEGRACIÓN CON BACKEND ---
// Esto inicia el servidor Express y el bot de WhatsApp al mismo tiempo
require('./index.js');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 480,
        height: 750,
        minWidth: 400,
        minHeight: 600,
        title: 'Big Jack Bot | Control Center',
        icon: path.join(__dirname, 'public/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // En desarrollo usamos el servidor local, en producción también (ya que el backend corre interno)
    mainWindow.loadURL('http://localhost:3000');

    // Desactivar menú para look de aplicación limpia
    Menu.setApplicationMenu(null);

    // Opcional: Abrir devtools en desarrollo
    if (isDev) {
        // mainWindow.webContents.openDevTools({ mode: 'detach' });
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});
