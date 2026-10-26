// Pure helper shared by every IPC endpoint; rejects subframes and other windows.
export function authorized(event:{sender:unknown;senderFrame:unknown},window:{webContents:{mainFrame:unknown}}|null):boolean {
  return !!window && !!event.senderFrame && event.sender===window.webContents && event.senderFrame===window.webContents.mainFrame;
}
