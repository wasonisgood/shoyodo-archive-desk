# 蕉葉堂 巡回台帳 — 古物・戦前資料定期収集機
### （SHOYODO ARCHIVE DESK / Windows 原生應用程式）

本專案為 `japan-old-thing`（蕉葉堂）的**同門兄弟產品**，專門針對一九四五年（昭和二十年）以前的日本古書、尋常小學教科書、臺灣總督府與朝鮮總督府歷史文獻，提供 Windows 桌面定期爬蟲與目録收載系統。

---

## 🏛️ 與 japan-old-thing 的同源美學與規範

1. **版面架構完整一致**：
   - **自繪深墨選單欄（`CustomWindowTitleBar`）**：自定義深墨無邊框視窗標題欄，內建「台帳(F)」、「市場(M)」、「表示(V)」、「言語(L)」選單，搭配細緻的視窗控制鍵（`―`、`□`、`✕`）。
   - **開場展開動畫（`OpeningSplashScreen`）**：啟動時呈現水墨墨圈擴散與「蕉葉堂」朱印揭示動畫，徹底消除冷啟動時白屏閃爍感，點擊任一處可跳過。
   - **天之細帶（`.topbar`）**：頂部細帶標註出版年代範圍，右側設有常駐巡行狀態指示、立即走查按鈕與語言切換器。
   - **報頭題字（`.masthead`）**：大寫英文字體 `SHOYODO ARCHIVE DESK`、明朝體店堂題字 `蕉葉堂 巡回台帳`，以及副標題。
   - **導覽列（`.mast-nav`）**：經典日文/中文大字搭配下方斜體英文（`巡行目録 CATALOGUE`、`収集設定 REGULATION`、`監視端末 TERMINAL`）。
   - **和紙水墨客製化卷軸**：全面改用 6px 細膩和紙墨色滾動條（`::-webkit-scrollbar`），徹底解決 Windows 原生原生粗邊灰色滾動條突兀感與高度塌陷回彈頂部之問題。
   - **版心規範（`.shell`）**：採用 1140px 版心，搭配和紙底色（`--paper: #f2ede2`）、墨色（`--ink: #23201b`）、朱色（`--shu: #ad3a2a`）、藍染（`--ai: #2c4266`）。
   - **奧付（`.colophon`）**：頁尾完整呈現書誌奧付、市場連線狀況、資料庫存放路徑與版本資訊。

2. **徹底去除 AI 感與所有 Emoji 表情符號**：
   - 嚴格禁用現代霓虹色、Emoji（如 ⚡, 🔍, 💡, 🟢, ⏸️, ▶️, 🏷️）。
   - 採用純正和文書誌標點符號與典雅漢字：`〔日本の古本屋〕`、`〔ヤフオク〕`、`〔メルカリ〕`、`【戦前】`、`【明治】`、`【大正】`、`【昭和】`、`［ 巡行即時実行 ］`、`［ 帳面に留める ］`。

3. **完整支援雙語（日本語 / 繁體中文）**：
   - 點擊右上角 `日本語` / `中文` 按鈕，所有目錄項目、篩選標籤、設定表單、說明文字與奧付皆即時切換。

4. **真正的 Windows 桌面應用程式**：
   - 使用 **Electron** 深度封裝為標準 Windows 桌面原生視窗，內嵌獨立核心與離線資料資產，本機伺服器關閉時依然獨立正常運作。

---

## ⚡ 安裝與極速秒開方式

### 📦 客製化和風安裝程式（推薦）：
雙擊執行：
👉 [蕉葉堂巡回台帳_安裝程式.exe](file:///C:/Users/user/code/old-thing-search/蕉葉堂巡回台帳_安裝程式.exe) 或 [安裝蕉葉堂巡回台帳.bat](file:///C:/Users/user/code/old-thing-search/安裝蕉葉堂巡回台帳.bat)

- **外觀設計**：採用與「蕉葉堂」一致的和紙底色、朱色印鑑標籤與明朝體排版，支援日本語／繁體中文雙語切換。
- **無延遲秒開**：將完整 Electron 執行核心與資料庫資產一次性解壓部署至本機，並自動建立桌面與開始功能表「蕉葉堂 巡回台帳」秒開啟動捷徑。
- **解決 30 秒延遲**：日後在桌面雙擊圖示即可於 **0.5 秒內秒開**，完全無需每次等待單檔解壓縮！

### 🚀 免安裝極速秒開直接啟動：
若目前已在程式碼資料夾內，可直接雙擊：
👉 [蕉葉堂巡回台帳 (極速秒開).lnk](file:///C:/Users/user/code/old-thing-search/蕉葉堂巡回台帳%20(極速秒開).lnk) 或 [[極速秒開] 蕉葉堂巡回台帳.bat](file:///C:/Users/user/code/old-thing-search/%5B極速秒開%5D%20蕉葉堂巡回台帳.bat)
*(立即喚醒本機原生核心，0.5 秒瞬間載入進入開場水墨動畫！)*

---

## 🔄 線上更新與發版流程

- **安裝程式自我更新**：安裝程式開啟時會查詢 `latest.json`；線上有更高版本時，自動下載新版安裝程式、驗證 SHA-256，並以新版取代舊檔後繼續安裝（非強制版本可按「略過」）。
- **更新程式 `ShoyodoUpdater.exe`**（與安裝／解除安裝程式同風格）：台帳每次啟動約 6 秒後在背景檢查。
  - 有新版 → 跳出提示；按「立即更新」即下載並以 `--update` 模式自動升級，完成後重新開啟台帳。
  - 按「稍後再說」且**未勾選**「不要再提醒我」→ 下次開啟台帳再提醒。
  - **勾選**後 → 一個月內不再提醒（狀態存於 `%APPDATA%\Shoyodo\update-state.json`）。
  - **強制更新**（`mandatory: true` 或目前版本低於 `minimumVersion`）→ 無視延後設定，每次都提醒，只能「立即更新」或「結束台帳」。
  - 手動檢查：開始功能表「檢查更新」、系統匣右鍵、台帳(F) 選單「更新を確認」。

### 發版步驟
1. 修改 `package.json` 的 `version`，並在 `installer/release.json` 填寫 `notes`、`mandatory`、`minimumVersion`。
2. `npm run dist`（只需要 `release/win-unpacked`），再執行 `powershell -File installer/build_installer.ps1 -RebuildPayload`。
3. 執行 `powershell -File installer/publish_release.ps1`，自動建立 GitHub Release `v<版本>`（repo：`wasonisgood/shoyodo-archive-desk`，需為公開），並上傳 `latest.json` 與 `ShoyodoArchiveDesk-Setup.exe`。發佈後所有使用者下次開啟台帳就會收到更新提示。
4. 測試時可設定環境變數 `SHOYODO_UPDATE_URL=file:///C:/path/latest.json` 指向本機清單。
