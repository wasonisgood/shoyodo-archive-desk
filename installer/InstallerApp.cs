using System;
using System.Diagnostics;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Shell;
using Microsoft.Win32;
using Shoyodo;

namespace ShoyodoInstaller {
    public class InstallerWindow : Window {
        private string currentLang = "zh"; // 預設繁體中文

        // 色彩配置（與 japan-old-thing 完全一致）
        private static readonly SolidColorBrush BrushPaper = new SolidColorBrush(Color.FromRgb(0xF2, 0xED, 0xE2));
        private static readonly SolidColorBrush BrushPaperCard = new SolidColorBrush(Color.FromRgb(0xF7, 0xF3, 0xEA));
        private static readonly SolidColorBrush BrushDarkBar = new SolidColorBrush(Color.FromRgb(0x1A, 0x17, 0x14));
        private static readonly SolidColorBrush BrushInk = new SolidColorBrush(Color.FromRgb(0x23, 0x20, 0x1B));
        private static readonly SolidColorBrush BrushInkSoft = new SolidColorBrush(Color.FromRgb(0x5D, 0x55, 0x4A));
        private static readonly SolidColorBrush BrushInkFaint = new SolidColorBrush(Color.FromRgb(0x8D, 0x84, 0x75));
        private static readonly SolidColorBrush BrushHair = new SolidColorBrush(Color.FromRgb(0xCB, 0xBF, 0xA8));
        private static readonly SolidColorBrush BrushRule = new SolidColorBrush(Color.FromRgb(0x2A, 0x26, 0x20));
        private static readonly SolidColorBrush BrushShu = new SolidColorBrush(Color.FromRgb(0xAD, 0x3A, 0x2A));
        private static readonly SolidColorBrush BrushShuHover = new SolidColorBrush(Color.FromRgb(0x8E, 0x2B, 0x1D));

        // 字體
        private static readonly FontFamily FontMincho = new FontFamily("Shippori Mincho, Yu Mincho, Hiragino Mincho ProN, MS Mincho, Georgia, serif");
        private static readonly FontFamily FontGothic = new FontFamily("Zen Kaku Gothic New, Yu Gothic, Meiryo, Hiragino Sans, sans-serif");
        private static readonly FontFamily FontRoman = new FontFamily("Cormorant Garamond, Times New Roman, serif");

        // UI 元件
        private TextBlock txtTitleBar;
        private Button btnToggleLang;
        private TextBlock txtKicker;
        private TextBlock txtPageTitle;
        private TextBlock txtPageLead;
        private TextBlock txtLblPath;
        private TextBox txtInstallPath;
        private Button btnBrowse;
        private CheckBox chkDesktop;
        private TextBlock txtLblDesktop;
        private CheckBox chkStartMenu;
        private TextBlock txtLblStartMenu;
        private TextBlock txtSizeBadge;
        private Button btnCancel;
        private Button btnAction;
        private TextBlock txtFootNote;

        // 進度步驟元件
        private Border cardConfig;
        private Border cardProgress;
        private Border cardComplete;
        private TextBlock txtProgressTitle;
        private ProgressBar prgBar;
        private TextBlock txtProgressStatus;
        private TextBlock txtProgressPct;
        private TextBlock txtCompleteTitle;
        private TextBlock txtCompleteDesc;

        private Button btnMaximize;
        private bool isMaximized = false;
        private Rect normalBounds;

        // 已安裝偵測 / 修復模式
        private bool isRepairMode = false;
        private bool installFinished = false;
        private string existingInstallDir = null;
        private string installedVersion = null;   // 既有安裝的版本（登錄檔 DisplayVersion）
        private bool isUpgrade = false;           // 既有版本 < 本安裝程式版本

        // 安裝程式自我更新
        private bool selfUpdating = false;
        private volatile bool selfUpdateCancel = false;
        private UpdateManifest selfUpdateManifest = null;

        public InstallerWindow() {
            if (InstallerOptions.Lang == "ja" || InstallerOptions.Lang == "zh") currentLang = InstallerOptions.Lang;
            // 視窗基礎設定：無原生menu、無醜陋OS框、支援自適應與最大化
            Title = "蕉葉堂 巡回台帳 ・ 安裝指南";
            Width = 820;
            Height = 570;
            MinWidth = 700;
            MinHeight = 490;
            WindowStartupLocation = WindowStartupLocation.CenterScreen;
            WindowStyle = WindowStyle.None;
            ResizeMode = ResizeMode.CanResizeWithGrip;
            Background = BrushPaper;
            Foreground = BrushInk;
            FontFamily = FontMincho;

            try {
                Stream iconStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app.ico");
                if (iconStream != null) {
                    Icon = System.Windows.Media.Imaging.BitmapFrame.Create(iconStream);
                }
            } catch { }

            // 去除 WindowStyle.None + 可縮放時 Windows 於頂端殘留的白色縮放邊框
            WindowChrome.SetWindowChrome(this, new WindowChrome {
                CaptionHeight = 0,
                ResizeBorderThickness = new Thickness(6),
                GlassFrameThickness = new Thickness(0),
                CornerRadius = new CornerRadius(0),
                UseAeroCaptionButtons = false
            });

            BuildUI();
            DetectExistingInstall();
            UpdateLanguage();
            Loaded += OnStartup;
        }

        private void OnStartup(object sender, RoutedEventArgs e) {
            // 由更新程式啟動：直接升級既有安裝（保留使用者原本的捷徑選擇）
            if (InstallerOptions.UpdateMode && existingInstallDir != null) {
                string desk = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "蕉葉堂 巡回台帳.lnk");
                string start = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "蕉葉堂 巡回台帳.lnk");
                chkDesktop.IsChecked = File.Exists(desk);
                chkStartMenu.IsChecked = File.Exists(start) || Directory.Exists(System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "蕉葉堂"));
                StartInstallWorkflow();
                return;
            }
            if (!InstallerOptions.NoSelfUpdate) CheckForNewerInstaller();
        }

        // ───── 安裝程式自我更新：開啟時檢查線上是否有更高版本的安裝程式 ─────
        private async void CheckForNewerInstaller() {
            bool ja = currentLang == "ja";
            btnAction.IsEnabled = false;
            txtFootNote.Text = ja ? "新しい版の配備プログラムを確認中…" : "正在檢查是否有更新版本的安裝程式…";
            UpdateManifest m = null;
            try {
                m = await Task.Run(() => UpdateCommon.FetchManifest(6000));
            } catch (Exception ex) {
                Log("Self-update check failed: " + ex.Message);
            }
            if (installFinished || cardConfig.Visibility != Visibility.Visible) return;
            ja = currentLang == "ja";

            if (m == null || !UpdateCommon.IsNewer(m.Version, BuildInfo.Version)) {
                btnAction.IsEnabled = true;
                txtFootNote.Text = m == null
                    ? (ja ? "更新サーバーに接続できないため、現行版 v" + BuildInfo.Version + " で配備します。" : "無法連線更新伺服器，將以目前版本 v" + BuildInfo.Version + " 安裝。")
                    : (ja ? "最新の配備プログラムです（v" + BuildInfo.Version + "）" : "已是最新版安裝程式（v" + BuildInfo.Version + "）");
                return;
            }

            Log("Newer installer found: " + m.Version + " (self " + BuildInfo.Version + ")");
            selfUpdateManifest = m;
            await DownloadAndRelaunchNewerInstaller();
        }

        private void ApplySelfUpdateTexts() {
            if (!selfUpdating || selfUpdateManifest == null) return;
            bool ja = currentLang == "ja";
            string v = "v" + UpdateCommon.ParseVersion(selfUpdateManifest.Version).ToString(3);
            txtKicker.Text = "SHOYODO ARCHIVE DESK / SELF UPDATE";
            txtPageTitle.Text = ja ? "新しい配備プログラムがございます" : "發現新版安裝程式";
            txtPageLead.Text = ja
                ? "より新しい版（" + v + "）の配備プログラムを取得し、自動で差し替えて続行します。"
                : "線上已有更高版本（" + v + "）的安裝程式，正在自動下載並取代目前的安裝程式。";
            txtProgressTitle.Text = ja ? "新しい配備プログラム " + v + " を取得中…" : "正在下載新版安裝程式 " + v + "…";
            btnCancel.Content = ja ? "［ 現行版で配備する ］" : "［ 略過，使用目前版本 ］";
        }

        private async Task DownloadAndRelaunchNewerInstaller() {
            UpdateManifest m = selfUpdateManifest;
            selfUpdating = true;
            selfUpdateCancel = false;
            cardConfig.Visibility = Visibility.Collapsed;
            cardProgress.Visibility = Visibility.Visible;
            btnAction.Visibility = Visibility.Collapsed;
            // 強制更新版本不允許略過
            btnCancel.Visibility = m.IsForcedFor(BuildInfo.Version) ? Visibility.Collapsed : Visibility.Visible;
            prgBar.Value = 0;
            txtProgressPct.Text = "0%";
            txtProgressStatus.Text = (currentLang == "ja") ? "接続中…" : "連線中…";
            ApplySelfUpdateTexts();

            string dest = UpdateCommon.InstallerDownloadPath(m);
            string error = null;
            try {
                await Task.Run(() => {
                    UpdateCommon.CleanupOldDownloads();
                    UpdateCommon.DownloadFile(m.InstallerUrl, dest, m.Size, (done, total) => {
                        Dispatcher.BeginInvoke(new Action(() => {
                            int pct = total > 0 ? (int)(done * 100 / total) : 0;
                            prgBar.Value = pct;
                            txtProgressPct.Text = total > 0 ? pct + "%" : "";
                            txtProgressStatus.Text = UpdateCommon.FormatSize(done) + (total > 0 ? " / " + UpdateCommon.FormatSize(total) : "");
                        }));
                    }, () => selfUpdateCancel);
                    UpdateCommon.VerifyInstaller(dest, m);
                });
            } catch (OperationCanceledException) {
                Log("Self-update skipped by user");
                try { File.Delete(dest + ".part"); } catch { }
                EndSelfUpdate(null);
                return;
            } catch (Exception ex) {
                Log("Self-update download failed: " + ex);
                try { File.Delete(dest); } catch { }
                error = ex.Message;
            }

            if (error == null) {
                try {
                    string self = Assembly.GetExecutingAssembly().Location;
                    string args = "--no-self-update --lang " + currentLang +
                                  " --old-pid " + Process.GetCurrentProcess().Id +
                                  " --replace " + UpdateCommon.Quote(self);
                    Process.Start(new ProcessStartInfo { FileName = dest, Arguments = args, UseShellExecute = true });
                    Log("Relaunching with newer installer " + dest);
                    installFinished = true; // 避免關閉時被誤判
                    Application.Current.Shutdown();
                    return;
                } catch (Exception ex) {
                    Log("Relaunch newer installer failed: " + ex);
                    error = ex.Message;
                }
            }
            EndSelfUpdate(error);
        }

        private void EndSelfUpdate(string error) {
            selfUpdating = false;
            bool forcedSelf = selfUpdateManifest != null && selfUpdateManifest.IsForcedFor(BuildInfo.Version);
            cardProgress.Visibility = Visibility.Collapsed;
            cardConfig.Visibility = Visibility.Visible;
            btnAction.Visibility = Visibility.Visible;
            btnCancel.Visibility = Visibility.Visible;
            UpdateLanguage();
            txtKicker.Text = isRepairMode ? "SHOYODO ARCHIVE DESK / REPAIR SUITE" : "SHOYODO ARCHIVE DESK / INSTALLATION SUITE";
            bool ja = currentLang == "ja";
            if (error != null) {
                ShowWarn((ja ? "新しい配備プログラムの取得に失敗しました：" : "新版安裝程式下載失敗：") + error +
                    "\n\n" + (forcedSelf
                        ? (ja ? "この版は必須更新のため、ネットワークを確認して再度お試しください。" : "此版本為強制更新，請確認網路後重新開啟安裝程式。")
                        : (ja ? "現行版 v" + BuildInfo.Version + " で配備を続行できます。" : "您仍可使用目前版本 v" + BuildInfo.Version + " 繼續安裝。")));
            }
            if (forcedSelf && error != null) {
                btnAction.IsEnabled = false;
                txtFootNote.Text = ja ? "必須更新の配備プログラムを取得できませんでした。" : "無法取得強制更新版安裝程式，請稍後再試。";
            } else {
                btnAction.IsEnabled = true;
                txtFootNote.Text = ja ? "現行版 v" + BuildInfo.Version + " で配備します。" : "將以目前版本 v" + BuildInfo.Version + " 安裝。";
            }
        }

        // 偵測本機是否已安裝：讀取解除安裝登錄機碼的 InstallLocation，並確認主程式仍存在
        private void DetectExistingInstall() {
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk")) {
                    if (key != null) {
                        string loc = key.GetValue("InstallLocation") as string;
                        if (!string.IsNullOrEmpty(loc) && File.Exists(System.IO.Path.Combine(loc, "蕉葉堂巡回台帳.exe"))) {
                            existingInstallDir = loc;
                        }
                        installedVersion = key.GetValue("DisplayVersion") as string;
                    }
                }
            } catch { }

            if (existingInstallDir == null) {
                string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string defaultDir = System.IO.Path.Combine(localApp, "Programs", "ShoyodoArchiveDesk");
                if (File.Exists(System.IO.Path.Combine(defaultDir, "蕉葉堂巡回台帳.exe"))) {
                    existingInstallDir = defaultDir;
                }
            }

            if (existingInstallDir != null) {
                isRepairMode = true;
                isUpgrade = UpdateCommon.IsNewer(BuildInfo.Version, installedVersion ?? "0");
                txtInstallPath.Text = existingInstallDir;
                txtInstallPath.IsReadOnly = true;
                txtInstallPath.Background = BrushPaperCard;
                btnBrowse.IsEnabled = false;
                btnBrowse.Opacity = 0.45;
            }
        }

        private void ApplyRepairModeTexts() {
            if (!isRepairMode || installFinished) return;
            if (isUpgrade) {
                string from = "v" + UpdateCommon.ParseVersion(installedVersion ?? "0").ToString(3);
                string to = "v" + UpdateCommon.ParseVersion(BuildInfo.Version).ToString(3);
                txtKicker.Text = "SHOYODO ARCHIVE DESK / UPGRADE SUITE";
                if (currentLang == "ja") {
                    txtPageTitle.Text = "新しい版へ更新";
                    txtPageLead.Text = "このコンピュータの「蕉葉堂 巡回台帳」（" + from + "）を " + to + " へ更新します。\n台帳データと設定はすべて保持されます。";
                    txtLblPath.Text = "既存の配備先ディレクトリ：";
                    btnAction.Content = "［ " + to + " へ更新 ］";
                    txtProgressTitle.Text = "台帳を " + to + " へ更新中...";
                    txtCompleteTitle.Text = "更新が完了しました";
                    txtCompleteDesc.Text = "「蕉葉堂 巡回台帳」を " + to + " へ更新しました。台帳データは保持されています。";
                } else {
                    txtPageTitle.Text = "升級至新版本";
                    txtPageLead.Text = "此電腦已安裝「蕉葉堂 巡回台帳」" + from + "，將升級至 " + to + "。\n台帳資料與設定皆會保留。";
                    txtLblPath.Text = "既有安裝目錄：";
                    btnAction.Content = "［ 升級至 " + to + " ］";
                    txtProgressTitle.Text = "正在升級台帳至 " + to + "...";
                    txtCompleteTitle.Text = "升級完成";
                    txtCompleteDesc.Text = "「蕉葉堂 巡回台帳」已升級至 " + to + "，台帳資料皆已保留。";
                }
                return;
            }
            txtKicker.Text = "SHOYODO ARCHIVE DESK / REPAIR SUITE";
            if (currentLang == "ja") {
                txtPageTitle.Text = "既に配備済みです";
                txtPageLead.Text = "このコンピュータには「蕉葉堂 巡回台帳」が既に配備されています。重複配備はできません。\n必要であれば「修復」で中核ファイルとショートカットを再配備してください（台帳データは保持されます）。";
                txtLblPath.Text = "既存の配備先ディレクトリ：";
                btnAction.Content = "［ 修復する ］";
                txtProgressTitle.Text = "台帳を修復中...";
                txtCompleteTitle.Text = "修復が完了しました";
                txtCompleteDesc.Text = "「蕉葉堂 巡回台帳」の中核ファイルとショートカットを再配備しました。";
            } else {
                txtPageTitle.Text = "偵測到已安裝";
                txtPageLead.Text = "此電腦已安裝「蕉葉堂 巡回台帳」，無法重複安裝。\n如程式異常，可選擇「修復」重新部署核心檔案與捷徑（台帳資料會保留）。";
                txtLblPath.Text = "既有安裝目錄：";
                btnAction.Content = "［ 修復安裝 ］";
                txtProgressTitle.Text = "正在修復台帳核心檔案...";
                txtCompleteTitle.Text = "修復完成";
                txtCompleteDesc.Text = "已重新部署「蕉葉堂 巡回台帳」核心檔案與捷徑，台帳資料皆已保留。";
            }
        }

        // ───── 跨電腦部署防護 ─────

        // 安裝記錄檔（出錯時可請對方傳回此檔）
        public static readonly string LogPath = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "ShoyodoInstaller.log");
        public static void Log(string msg) {
            try { File.AppendAllText(LogPath, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine); } catch { }
        }

        private void ShowWarn(string msg) {
            Log("WARN: " + msg);
            MessageBox.Show(this, msg, (currentLang == "ja") ? "蕉葉堂 巡回台帳 — 配備案内" : "蕉葉堂 巡回台帳 — 安裝指南",
                MessageBoxButton.OK, MessageBoxImage.Warning);
        }

        // 若使用者選的是「已有其他檔案的資料夾」（例如 D:\ 或 文件），自動改為其下的 ShoyodoArchiveDesk 子資料夾，
        // 避免程式檔與使用者檔案混在一起，日後解除安裝時也不會誤刪
        private static string EnsureDedicatedFolder(string dir) {
            if (!Directory.Exists(dir)) return dir;
            if (File.Exists(System.IO.Path.Combine(dir, "蕉葉堂巡回台帳.exe"))) return dir;
            bool empty = Directory.GetFileSystemEntries(dir).Length == 0;
            if (empty && !string.Equals(System.IO.Path.GetPathRoot(dir).TrimEnd('\\'), dir, StringComparison.OrdinalIgnoreCase)) return dir;
            return System.IO.Path.Combine(dir, "ShoyodoArchiveDesk");
        }

        private static bool HasChromiumBrowser() {
            string[] roots = {
                Environment.GetEnvironmentVariable("ProgramFiles"),
                Environment.GetEnvironmentVariable("ProgramFiles(x86)"),
                Environment.GetEnvironmentVariable("LOCALAPPDATA")
            };
            string[] rel = {
                @"Google\Chrome\Application\chrome.exe",
                @"Microsoft\Edge\Application\msedge.exe",
                @"BraveSoftware\Brave-Browser\Application\brave.exe"
            };
            foreach (string r in roots) {
                if (string.IsNullOrEmpty(r)) continue;
                foreach (string p in rel) {
                    try { if (File.Exists(System.IO.Path.Combine(r, p))) return true; } catch { }
                }
            }
            return false;
        }

        private static string PrecheckTarget(string dir, bool ja) {
            // 1. 寫入權限（例如選到 C:\Program Files 但未以系統管理員執行）
            try {
                Directory.CreateDirectory(dir);
                string probe = System.IO.Path.Combine(dir, ".write-test-" + Guid.NewGuid().ToString("N"));
                File.WriteAllText(probe, "ok");
                File.Delete(probe);
            } catch (Exception ex) {
                Log("Write probe failed: " + ex);
                return ja
                    ? "このフォルダには書き込めません：\n" + dir + "\n\n既定のフォルダ（%LocalAppData%\\Programs\\ShoyodoArchiveDesk）を使用してください。"
                    : "無法寫入此資料夾：\n" + dir + "\n\n請改用預設安裝目錄（%LocalAppData%\\Programs\\ShoyodoArchiveDesk），或以系統管理員身分執行安裝程式。";
            }

            // 2. 磁碟空間（解壓後約 320 MB，保留 100 MB 餘裕）
            try {
                DriveInfo drive = new DriveInfo(System.IO.Path.GetPathRoot(dir));
                long need = 420L * 1024 * 1024;
                if (drive.IsReady && drive.AvailableFreeSpace < need) {
                    long freeMb = drive.AvailableFreeSpace / 1024 / 1024;
                    return ja
                        ? string.Format("ディスク容量が不足しています（空き {0} MB / 必要 約 420 MB）。", freeMb)
                        : string.Format("磁碟空間不足（剩餘 {0} MB，需要約 420 MB）。請清出空間或改選其他磁碟。", freeMb);
                }
            } catch (Exception ex) {
                Log("Disk check skipped: " + ex.Message); // 網路磁碟等無法查詢時略過
            }
            return null;
        }

        // 覆寫檔案前先關閉執行中的台帳，避免檔案鎖定導致部署失敗
        private void StopRunningApp() {
            // 更新程式會在啟動安裝程式後自行結束；稍候片刻，仍未結束才強制關閉，以便覆寫 ShoyodoUpdater.exe
            try {
                foreach (Process p in Process.GetProcessesByName("ShoyodoUpdater")) {
                    try { if (!p.WaitForExit(4000)) { p.Kill(); p.WaitForExit(3000); } } catch { }
                }
            } catch { }
            try {
                foreach (Process p in Process.GetProcessesByName("蕉葉堂巡回台帳")) {
                    try {
                        p.Kill();
                        p.WaitForExit(5000);
                    } catch { }
                }
            } catch { }
        }

        private void BuildUI() {
            // 主外框 Grid：自適應拉伸
            Grid rootGrid = new Grid();
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(44, GridUnitType.Pixel) }); // 頂部標題列
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });  // 內容區自適應填滿

            // 1. 自繪頂部標題列（深墨和風，徹底去除原生 Menu）
            Border titleBar = new Border {
                Background = BrushDarkBar,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x36, 0x30, 0x27)),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            titleBar.MouseDown += (s, e) => {
                if (e.LeftButton == MouseButtonState.Pressed) {
                    if (e.ClickCount == 2) {
                        ToggleMaximize();
                    } else {
                        DragMove();
                    }
                }
            };

            Grid titleGrid = new Grid();
            titleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            titleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            // 左側印章與文字
            StackPanel titleLeft = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(16, 0, 0, 0)
            };

            Border sealBox = new Border {
                Width = 24,
                Height = 24,
                Background = BrushShu,
                CornerRadius = new CornerRadius(2),
                Margin = new Thickness(0, 0, 10, 0)
            };
            TextBlock txtSeal = new TextBlock {
                Text = "蕉",
                Foreground = Brushes.White,
                FontWeight = FontWeights.Bold,
                FontSize = 13,
                FontFamily = FontMincho,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            sealBox.Child = txtSeal;

            txtTitleBar = new TextBlock {
                Foreground = new SolidColorBrush(Color.FromRgb(0xED, 0xE5, 0xD5)),
                FontSize = 13,
                FontWeight = FontWeights.Medium,
                VerticalAlignment = VerticalAlignment.Center
            };

            titleLeft.Children.Add(sealBox);
            titleLeft.Children.Add(txtTitleBar);
            Grid.SetColumn(titleLeft, 0);
            titleGrid.Children.Add(titleLeft);

            // 右側：語言切換、最小化、最大化、關閉
            StackPanel titleRight = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center,
                Margin = new Thickness(0, 0, 8, 0)
            };

            btnToggleLang = CreateTitleBarButton("切換為繁體中文", 11);
            btnToggleLang.Click += (s, e) => {
                currentLang = (currentLang == "ja") ? "zh" : "ja";
                UpdateLanguage();
            };

            Button btnMinimize = CreateTitleBarGlyphButton("―", 11);
            btnMinimize.Click += (s, e) => WindowState = WindowState.Minimized;

            btnMaximize = CreateTitleBarGlyphButton("□", 12);
            btnMaximize.Click += (s, e) => ToggleMaximize();

            Button btnClose = CreateTitleBarGlyphButton("✕", 13);
            btnClose.Click += (s, e) => Close();

            titleRight.Children.Add(btnToggleLang);
            titleRight.Children.Add(btnMinimize);
            titleRight.Children.Add(btnMaximize);
            titleRight.Children.Add(btnClose);
            Grid.SetColumn(titleRight, 1);
            titleGrid.Children.Add(titleRight);

            titleBar.Child = titleGrid;
            Grid.SetRow(titleBar, 0);
            rootGrid.Children.Add(titleBar);

            // 2. 內容自適應區域
            Border contentBorder = new Border {
                Padding = new Thickness(44, 30, 44, 26),
                Background = BrushPaper
            };

            Grid mainGrid = new Grid();
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Header 標頭題字
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) }); // 核心內容卡片（可隨視窗放大自由展開）
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto }); // Footer 操作列

            // Header 區域
            StackPanel headerStack = new StackPanel { Margin = new Thickness(0, 0, 0, 20) };
            txtKicker = new TextBlock {
                FontFamily = FontRoman,
                FontSize = 11,
                Foreground = BrushInkFaint,
                Margin = new Thickness(0, 0, 0, 4),
                Text = "SHOYODO ARCHIVE DESK / INSTALLATION SUITE"
            };
            txtPageTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 26,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                Margin = new Thickness(0, 0, 0, 8)
            };
            txtPageLead = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 13,
                Foreground = BrushInkSoft,
                LineHeight = 22
            };
            Border headerLine = new Border {
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Margin = new Thickness(0, 14, 0, 0)
            };

            headerStack.Children.Add(txtKicker);
            headerStack.Children.Add(txtPageTitle);
            headerStack.Children.Add(txtPageLead);
            headerStack.Children.Add(headerLine);
            Grid.SetRow(headerStack, 0);
            mainGrid.Children.Add(headerStack);

            // 核心內容區（三個卡片：設定、進度、完成，完全支援自適應延伸）
            Grid cardContainer = new Grid {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            // 卡片 1：設定
            cardConfig = CreateStepCard();
            StackPanel cfgStack = new StackPanel { VerticalAlignment = VerticalAlignment.Center };

            txtLblPath = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = BrushInkSoft,
                Margin = new Thickness(0, 0, 0, 8)
            };

            Grid pathRow = new Grid { Margin = new Thickness(0, 0, 0, 16) };
            pathRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            pathRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            string localApp = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
            string defaultPath = System.IO.Path.Combine(localApp, "Programs", "ShoyodoArchiveDesk");

            txtInstallPath = new TextBox {
                Text = defaultPath,
                FontFamily = new FontFamily("Consolas, Courier New, monospace"),
                FontSize = 13,
                Foreground = BrushInk,
                Background = Brushes.White,
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(1, 1, 1, 2),
                Padding = new Thickness(10, 8, 10, 8),
                VerticalContentAlignment = VerticalAlignment.Center
            };
            Grid.SetColumn(txtInstallPath, 0);
            pathRow.Children.Add(txtInstallPath);

            btnBrowse = CreateOutlinedButton("［ 瀏覽 ］", 12);
            btnBrowse.Margin = new Thickness(10, 0, 0, 0);
            btnBrowse.Padding = new Thickness(16, 7, 16, 7);
            btnBrowse.Click += (s, e) => BrowseInstallPath();
            Grid.SetColumn(btnBrowse, 1);
            pathRow.Children.Add(btnBrowse);

            chkDesktop = new CheckBox {
                IsChecked = true,
                Margin = new Thickness(0, 4, 0, 8),
                VerticalContentAlignment = VerticalAlignment.Center
            };
            txtLblDesktop = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                Foreground = BrushInk,
                Margin = new Thickness(6, 0, 0, 0)
            };
            chkDesktop.Content = txtLblDesktop;

            chkStartMenu = new CheckBox {
                IsChecked = true,
                Margin = new Thickness(0, 0, 0, 16),
                VerticalContentAlignment = VerticalAlignment.Center
            };
            txtLblStartMenu = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                Foreground = BrushInk,
                Margin = new Thickness(6, 0, 0, 0)
            };
            chkStartMenu.Content = txtLblStartMenu;

            Border dashLine = new Border {
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(0, 1, 0, 0),
                Margin = new Thickness(0, 4, 0, 10)
            };

            txtSizeBadge = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 11,
                Foreground = BrushInkFaint,
                LineHeight = 18
            };

            cfgStack.Children.Add(txtLblPath);
            cfgStack.Children.Add(pathRow);
            cfgStack.Children.Add(chkDesktop);
            cfgStack.Children.Add(chkStartMenu);
            cfgStack.Children.Add(dashLine);
            cfgStack.Children.Add(txtSizeBadge);
            cardConfig.Child = cfgStack;

            // 卡片 2：進度
            cardProgress = CreateStepCard();
            cardProgress.Visibility = Visibility.Collapsed;
            StackPanel prgStack = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Stretch,
                Margin = new Thickness(24, 0, 24, 0)
            };

            txtProgressTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 16,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                Margin = new Thickness(0, 0, 0, 16)
            };

            prgBar = new ProgressBar {
                Height = 8,
                Minimum = 0,
                Maximum = 100,
                Value = 0,
                Foreground = BrushShu,
                Background = new SolidColorBrush(Color.FromRgb(0xDC, 0xD3, 0xC1)),
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(1)
            };

            Grid prgStatusRow = new Grid { Margin = new Thickness(0, 12, 0, 0) };
            txtProgressStatus = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                Foreground = BrushInkSoft,
                HorizontalAlignment = HorizontalAlignment.Left
            };
            txtProgressPct = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                HorizontalAlignment = HorizontalAlignment.Right
            };
            prgStatusRow.Children.Add(txtProgressStatus);
            prgStatusRow.Children.Add(txtProgressPct);

            prgStack.Children.Add(txtProgressTitle);
            prgStack.Children.Add(prgBar);
            prgStack.Children.Add(prgStatusRow);
            cardProgress.Child = prgStack;

            // 卡片 3：完成
            cardComplete = CreateStepCard();
            cardComplete.Visibility = Visibility.Collapsed;
            StackPanel cmpStack = new StackPanel {
                VerticalAlignment = VerticalAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };

            Border sealLarge = new Border {
                Width = 64,
                Height = 64,
                BorderBrush = BrushShu,
                BorderThickness = new Thickness(2),
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 16)
            };
            TextBlock txtSealLarge = new TextBlock {
                Text = "完",
                FontFamily = FontMincho,
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = BrushShu,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            sealLarge.Child = txtSealLarge;

            txtCompleteTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 10)
            };

            txtCompleteDesc = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 13,
                Foreground = BrushInkSoft,
                LineHeight = 22,
                TextAlignment = TextAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center
            };

            cmpStack.Children.Add(sealLarge);
            cmpStack.Children.Add(txtCompleteTitle);
            cmpStack.Children.Add(txtCompleteDesc);
            cardComplete.Child = cmpStack;

            cardContainer.Children.Add(cardConfig);
            cardContainer.Children.Add(cardProgress);
            cardContainer.Children.Add(cardComplete);

            Grid.SetRow(cardContainer, 1);
            mainGrid.Children.Add(cardContainer);

            // Footer 區域（底欄按鈕與標記）
            Grid footGrid = new Grid { Margin = new Thickness(0, 20, 0, 0) };
            footGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            footGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            txtFootNote = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 11,
                Foreground = BrushInkFaint,
                VerticalAlignment = VerticalAlignment.Center,
                Text = "© SHOYODO ARCHIVE DESK / 蕉葉文庫 書誌編纂係"
            };
            Grid.SetColumn(txtFootNote, 0);
            footGrid.Children.Add(txtFootNote);

            StackPanel btnPanel = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };

            btnCancel = CreateOutlinedButton("［ 中止 ］", 12);
            btnCancel.Padding = new Thickness(20, 8, 20, 8);
            btnCancel.Margin = new Thickness(0, 0, 12, 0);
            btnCancel.Click += (s, e) => {
                if (selfUpdating) { selfUpdateCancel = true; return; }
                Close();
            };

            btnAction = CreateVermilionButton("［ 開始安裝 ］", 13);
            btnAction.Padding = new Thickness(26, 8, 26, 8);
            btnAction.Click += (s, e) => {
                if (installFinished) return; // 完成後按鈕改為「立即開啟」，不再重跑安裝
                StartInstallWorkflow();
            };

            btnPanel.Children.Add(btnCancel);
            btnPanel.Children.Add(btnAction);
            Grid.SetColumn(btnPanel, 1);
            footGrid.Children.Add(btnPanel);

            Grid.SetRow(footGrid, 2);
            mainGrid.Children.Add(footGrid);

            contentBorder.Child = mainGrid;
            Grid.SetRow(contentBorder, 1);
            rootGrid.Children.Add(contentBorder);

            Content = rootGrid;
        }

        private void ToggleMaximize() {
            if (isMaximized) {
                Left = normalBounds.Left;
                Top = normalBounds.Top;
                Width = normalBounds.Width;
                Height = normalBounds.Height;
                isMaximized = false;
                btnMaximize.Content = "□";
            } else {
                normalBounds = new Rect(Left, Top, Width, Height);
                var workArea = SystemParameters.WorkArea;
                Left = workArea.Left;
                Top = workArea.Top;
                Width = workArea.Width;
                Height = workArea.Height;
                isMaximized = true;
                btnMaximize.Content = "❐";
            }
        }

        private Border CreateStepCard() {
            return new Border {
                Background = BrushPaperCard,
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(32, 28, 32, 28),
                HorizontalAlignment = HorizontalAlignment.Stretch,
                VerticalAlignment = VerticalAlignment.Stretch
            };
        }

        private Button CreateTitleBarButton(string text, double fontSize) {
            Button btn = new Button {
                Content = text,
                FontSize = fontSize,
                FontFamily = FontGothic,
                Foreground = new SolidColorBrush(Color.FromRgb(0xCB, 0xBF, 0xA8)),
                Background = Brushes.Transparent,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x55, 0x4A, 0x3E)),
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 2, 8, 2),
                Margin = new Thickness(0, 0, 10, 0),
                Cursor = Cursors.Hand
            };
            btn.MouseEnter += (s, e) => btn.Background = new SolidColorBrush(Color.FromRgb(0x2C, 0x25, 0x1F));
            btn.MouseLeave += (s, e) => btn.Background = Brushes.Transparent;
            return btn;
        }

        private Button CreateTitleBarGlyphButton(string glyph, double fontSize) {
            Button btn = new Button {
                Content = glyph,
                FontSize = fontSize,
                FontFamily = FontMincho,
                Foreground = new SolidColorBrush(Color.FromRgb(0x8C, 0x82, 0x70)),
                Background = Brushes.Transparent,
                BorderThickness = new Thickness(0),
                Width = 32,
                Height = 32,
                Cursor = Cursors.Hand,
                VerticalContentAlignment = VerticalAlignment.Center,
                HorizontalContentAlignment = HorizontalAlignment.Center
            };
            btn.MouseEnter += (s, e) => {
                btn.Background = (glyph == "✕") ? BrushShu : new SolidColorBrush(Color.FromRgb(0x2C, 0x25, 0x1F));
                btn.Foreground = Brushes.White;
            };
            btn.MouseLeave += (s, e) => {
                btn.Background = Brushes.Transparent;
                btn.Foreground = new SolidColorBrush(Color.FromRgb(0x8C, 0x82, 0x70));
            };
            return btn;
        }

        private Button CreateOutlinedButton(string text, double fontSize) {
            Button btn = new Button {
                Content = text,
                FontSize = fontSize,
                FontFamily = FontGothic,
                FontWeight = FontWeights.SemiBold,
                Foreground = BrushInk,
                Background = Brushes.Transparent,
                BorderBrush = BrushRule,
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            btn.MouseEnter += (s, e) => {
                btn.Background = BrushInk;
                btn.Foreground = BrushPaper;
            };
            btn.MouseLeave += (s, e) => {
                btn.Background = Brushes.Transparent;
                btn.Foreground = BrushInk;
            };
            return btn;
        }

        private Button CreateVermilionButton(string text, double fontSize) {
            Button btn = new Button {
                Content = text,
                FontSize = fontSize,
                FontFamily = FontGothic,
                FontWeight = FontWeights.Bold,
                Foreground = Brushes.White,
                Background = BrushShu,
                BorderBrush = BrushShu,
                BorderThickness = new Thickness(1),
                Cursor = Cursors.Hand
            };
            btn.MouseEnter += (s, e) => {
                btn.Background = BrushShuHover;
                btn.BorderBrush = BrushShuHover;
            };
            btn.MouseLeave += (s, e) => {
                btn.Background = BrushShu;
                btn.BorderBrush = BrushShu;
            };
            return btn;
        }

        private void BrowseInstallPath() {
            using (var dialog = new System.Windows.Forms.FolderBrowserDialog()) {
                dialog.Description = (currentLang == "ja") ? "配備先ディレクトリを選択してください" : "請選擇安裝目錄";
                dialog.ShowNewFolderButton = true;
                if (dialog.ShowDialog() == System.Windows.Forms.DialogResult.OK) {
                    txtInstallPath.Text = System.IO.Path.Combine(dialog.SelectedPath, "ShoyodoArchiveDesk");
                }
            }
        }

        private void UpdateLanguage() {
            if (currentLang == "ja") {
                Title = "蕉葉堂 巡回台帳 — 配備案内";
                btnToggleLang.Content = "切換為繁體中文";
                txtTitleBar.Text = "蕉葉堂 巡回台帳 ・ 配備案内";
                txtPageTitle.Text = "台帳配備設定";
                txtPageLead.Text = "本プログラムは、戦前古書・近代文献の定期巡回収集台帳をローカル環境へ直接配備します。";
                txtLblPath.Text = "配備先ディレクトリ（規定：標準プログラム庫）：";
                btnBrowse.Content = "［ 参照 ］";
                txtLblDesktop.Text = "デスクトップに「蕉葉堂 巡回台帳」の即時起動アイコンを作成する";
                txtLblStartMenu.Text = "スタートメニューに台帳プログラムを登録する";
                txtSizeBadge.Text = "所要ディスク容量：約 410 MB ｜ 配備完了後は 0.5 秒で瞬時に起動します（解凍遅延なし）。";
                btnCancel.Content = "［ 中止 ］";
                btnAction.Content = "［ 配備を開始する ］";
                txtProgressTitle.Text = "台帳リソースを展開中...";
                txtProgressStatus.Text = "初期化処理を実行中...";
                txtCompleteTitle.Text = "台帳の配備が完了しました";
                txtCompleteDesc.Text = "「蕉葉堂 巡回台帳」が正常にコンピュータへ配備されました。\nデスクトップアイコンより、いつでも 0.5 秒で瞬時に起動可能です。";
            } else {
                Title = "蕉葉堂 巡回台帳 — 安裝指南";
                btnToggleLang.Content = "日本語に切替";
                txtTitleBar.Text = "蕉葉堂 巡回台帳 ・ 安裝指南";
                txtPageTitle.Text = "台帳安裝設定";
                txtPageLead.Text = "本程序將於本機直接部署戰前古書、近代文獻定期巡回收集台帳，免除每次啟動的解壓延遲。";
                txtLblPath.Text = "安裝目標目錄（預設：本機程式庫）：";
                btnBrowse.Content = "［ 瀏覽 ］";
                txtLblDesktop.Text = "在桌面建立「蕉葉堂 巡回台帳」秒開啟動捷徑";
                txtLblStartMenu.Text = "在開始功能表建立程式項目";
                txtSizeBadge.Text = "所需磁碟空間：約 410 MB ｜ 部署完成後點擊即 0.5 秒極速秒開，無冷啟動解壓等待。";
                btnCancel.Content = "［ 中止 ］";
                btnAction.Content = "［ 開始安裝 ］";
                txtProgressTitle.Text = "正在部署台帳核心檔案...";
                txtProgressStatus.Text = "正在初始化安裝環境...";
                txtCompleteTitle.Text = "台帳配置完備";
                txtCompleteDesc.Text = "「蕉葉堂 巡回台帳」已順利安裝至您的電腦。\n桌面捷徑已建立，日常使用直接點擊即可 0.5 秒極速秒開運作。";
            }
            ApplyRepairModeTexts();
            ApplySelfUpdateTexts();
        }

        private async void StartInstallWorkflow() {
            string targetDir = txtInstallPath.Text.Trim();
            bool ja = currentLang == "ja";
            if (string.IsNullOrEmpty(targetDir)) {
                ShowWarn(ja ? "有効な配備先パスを入力してください。" : "請輸入有效的安裝路徑。");
                return;
            }

            // 安裝前檢查：路徑格式、目錄安全性、寫入權限、磁碟空間
            string precheckError = null;
            try {
                targetDir = System.IO.Path.GetFullPath(Environment.ExpandEnvironmentVariables(targetDir)).TrimEnd('\\', '/');
                if (!isRepairMode) {
                    targetDir = EnsureDedicatedFolder(targetDir);
                    txtInstallPath.Text = targetDir;
                }
                precheckError = PrecheckTarget(targetDir, ja);
            } catch (Exception ex) {
                precheckError = (ja ? "配備先パスが無効です：" : "安裝路徑無效：") + ex.Message;
            }
            if (precheckError != null) {
                ShowWarn(precheckError);
                return;
            }

            cardConfig.Visibility = Visibility.Collapsed;
            cardProgress.Visibility = Visibility.Visible;
            btnCancel.Visibility = Visibility.Collapsed;
            btnAction.IsEnabled = false;

            bool createDesktop = chkDesktop.IsChecked == true;
            bool createStartMenu = chkStartMenu.IsChecked == true;

            string installError = null;
            try {
                await Task.Run(() => PerformInstallation(targetDir, createDesktop, createStartMenu));
                if (!File.Exists(System.IO.Path.Combine(targetDir, "蕉葉堂巡回台帳.exe"))) {
                    installError = ja
                        ? "主プログラムの展開に失敗しました（防毒ソフトにより隔離された可能性があります）。"
                        : "主程式未能成功部署（可能被防毒軟體攔截或隔離）。";
                }
            } catch (UnauthorizedAccessException) {
                installError = ja
                    ? "配備先への書き込み権限がありません。既定のフォルダ（%LocalAppData%\\Programs）を選択してください。"
                    : "沒有寫入該目錄的權限。請改用預設安裝目錄（%LocalAppData%\\Programs），或以系統管理員身分執行。";
            } catch (IOException ex) {
                installError = (ja ? "ファイルの書き込みに失敗しました：" : "檔案寫入失敗：") + ex.Message +
                    (ja ? "\n台帳が起動中、またはディスク容量不足の可能性があります。" : "\n可能是台帳仍在執行、檔案被占用，或磁碟空間不足。");
            } catch (Exception ex) {
                installError = (ja ? "配備中にエラーが発生しました：" : "安裝過程發生錯誤：") + ex.Message;
            }

            if (installError != null) {
                // 回到設定畫面讓使用者可以重試，而不是誤顯示「安裝完畢」
                cardProgress.Visibility = Visibility.Collapsed;
                cardConfig.Visibility = Visibility.Visible;
                btnCancel.Visibility = Visibility.Visible;
                btnAction.IsEnabled = true;
                ShowWarn(installError + "\n\n" + (ja ? "詳細ログ：" : "詳細記錄：") + LogPath);
                return;
            }

            // 安裝完成畫面
            cardProgress.Visibility = Visibility.Collapsed;
            cardComplete.Visibility = Visibility.Visible;

            if (isUpgrade) {
                txtPageTitle.Text = (currentLang == "ja") ? "更新完了" : "升級完畢";
                txtPageLead.Text = (currentLang == "ja")
                    ? "v" + BuildInfo.Version + " への更新が正常に終了しました。"
                    : "已順利升級至 v" + BuildInfo.Version + "，台帳資料皆已保留。";
            } else if (isRepairMode) {
                txtPageTitle.Text = (currentLang == "ja") ? "修復完了" : "修復完畢";
                txtPageLead.Text = (currentLang == "ja")
                    ? "中核ファイルとショートカットの再配備が正常に終了しました。"
                    : "已重新部署核心檔案與捷徑，台帳資料皆已保留。";
            } else {
                txtPageTitle.Text = (currentLang == "ja") ? "配備完了" : "安裝完畢";
                txtPageLead.Text = (currentLang == "ja") 
                    ? "すべての環境構築と即時起動インデックスの作成が正常に終了しました。" 
                    : "已順利完成全部環境部署與極速秒開啟動捷徑設定。";
            }

            // 真實巡行需要本機 Chrome 或 Edge；找不到時於完成畫面明確提示
            if (!HasChromiumBrowser()) {
                txtCompleteDesc.Text += (currentLang == "ja")
                    ? "\n\n【注意】Google Chrome / Microsoft Edge が見つかりません。巡行機能を使うにはいずれかをインストールしてください。"
                    : "\n\n【注意】此電腦未偵測到 Google Chrome 或 Microsoft Edge，市場巡行功能需要其中之一，請先安裝。";
                Log("No Chromium browser found");
            }
            installFinished = true;
            btnAction.IsEnabled = true;
            btnAction.Content = (currentLang == "ja") ? "［ 直ちに台帳を起動 ］" : "［ 立即開啟台帳 ］";
            btnAction.Click += (s, e) => LaunchAppAndClose(targetDir);

            // 由更新程式啟動的升級：完成後自動重新開啟台帳
            if (InstallerOptions.LaunchAfter) {
                txtCompleteDesc.Text += (currentLang == "ja") ? "\n\nまもなく台帳を自動で再起動いたします…" : "\n\n台帳即將自動重新開啟…";
                await Task.Delay(1800);
                LaunchAppAndClose(targetDir);
            }
        }

        private bool appLaunched = false;
        private void LaunchAppAndClose(string targetDir) {
            if (appLaunched) return;
            appLaunched = true;
            try {
                string exePath = System.IO.Path.Combine(targetDir, "蕉葉堂巡回台帳.exe");
                if (File.Exists(exePath)) {
                    Process.Start(new ProcessStartInfo {
                        FileName = exePath,
                        WorkingDirectory = targetDir
                    });
                }
            } catch { }
            Close();
        }

        private void UpdateProgress(int pct, string status) {
            Dispatcher.Invoke(() => {
                prgBar.Value = pct;
                txtProgressPct.Text = pct + "%";
                txtProgressStatus.Text = status;
            });
        }

        private void PerformInstallation(string targetDir, bool createDesktop, bool createStartMenu) {
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;

            // 尋找來源壓縮包或目錄
            string zipFile = System.IO.Path.Combine(baseDir, "app-payload.zip");
            if (!File.Exists(zipFile)) {
                zipFile = System.IO.Path.Combine(baseDir, "installer", "app-payload.zip");
            }
            if (!File.Exists(zipFile)) {
                DirectoryInfo pInfo = Directory.GetParent(baseDir);
                if (pInfo != null) {
                    zipFile = System.IO.Path.Combine(pInfo.FullName, "installer", "app-payload.zip");
                }
            }

            string unpackedDir = System.IO.Path.Combine(baseDir, "win-unpacked");
            if (!Directory.Exists(unpackedDir)) {
                unpackedDir = System.IO.Path.Combine(baseDir, "release", "win-unpacked");
            }
            if (!Directory.Exists(unpackedDir)) {
                DirectoryInfo pInfo = Directory.GetParent(baseDir);
                if (pInfo != null) {
                    unpackedDir = System.IO.Path.Combine(pInfo.FullName, "release", "win-unpacked");
                }
            }

            // Step 1: 建立目錄
            UpdateProgress(10, (currentLang == "ja") ? "配備先ディレクトリを作成中..." : "正在建立目標檔案目錄...");
            StopRunningApp();
            Thread.Sleep(300);
            if (!Directory.Exists(targetDir)) {
                Directory.CreateDirectory(targetDir);
            }

            // Step 2: 部署檔案
            UpdateProgress(35, (currentLang == "ja") ? "Chromium コアおよび和風書誌リソースを展開中..." : "正在部署 Chromium 核心與和風書誌資產...");
            
            bool extracted = false;

            // 1. 優先嘗試讀取內嵌的壓縮封包（單一獨立安裝檔模式）
            try {
                Stream embeddedStream = Assembly.GetExecutingAssembly().GetManifestResourceStream("app-payload.zip");
                if (embeddedStream != null) {
                    using (embeddedStream) {
                        using (ZipArchive archive = new ZipArchive(embeddedStream, ZipArchiveMode.Read)) {
                            ExtractZipWithProgress(archive, targetDir);
                            extracted = true;
                        }
                    }
                }
            } catch (Exception ex) {
                Log("Embedded payload extraction failed: " + ex);
                if (ex is UnauthorizedAccessException) throw;
                extracted = false;
            }

            // 2. 若未內嵌，尋找同層或 installer 目錄下的外部 zipFile
            if (!extracted && File.Exists(zipFile)) {
                try {
                    using (ZipArchive archive = ZipFile.OpenRead(zipFile)) {
                        ExtractZipWithProgress(archive, targetDir);
                        extracted = true;
                    }
                } catch (Exception ex) {
                    Log("External payload extraction failed: " + ex);
                    extracted = false;
                }
            }

            // 3. 若有 unpackedDir 目錄，則作為備援直接複製
            if (!extracted && Directory.Exists(unpackedDir)) {
                CopyDirectory(unpackedDir, targetDir);
                extracted = true;
            }

            if (!extracted) {
                throw new IOException((currentLang == "ja")
                    ? "配備用リソースを展開できませんでした（インストーラーが破損している可能性があります）。"
                    : "無法解出安裝資源（安裝檔可能下載不完整或已損毀，請重新取得安裝檔）。");
            }
            Log("Payload deployed to " + targetDir);

            UpdateProgress(85, (currentLang == "ja") ? "即時起動インデックスを作成中..." : "正在配置極速秒開啟動捷徑...");
            Thread.Sleep(400);

            // Step 3: 提取解除安裝程式與高解析度圖示
            string uninstallerPath = System.IO.Path.Combine(targetDir, "uninstall.exe");
            string iconPath = System.IO.Path.Combine(targetDir, "app.ico");
            ExtractResourceToFile("uninstall.exe", uninstallerPath);
            ExtractResourceToFile("app.ico", iconPath);
            string updaterPath = System.IO.Path.Combine(targetDir, "ShoyodoUpdater.exe");
            ExtractResourceToFile("ShoyodoUpdater.exe", updaterPath);

            // Step 4: 捷徑註冊
            string exePath = System.IO.Path.Combine(targetDir, "蕉葉堂巡回台帳.exe");
            if (createDesktop) {
                string deskPath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "蕉葉堂 巡回台帳.lnk");
                CreateShortcut(deskPath, exePath, targetDir, "蕉葉堂 巡回台帳 — 戦前資料定期収集機", iconPath);
            }

            if (createStartMenu) {
                string progDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string startPath = System.IO.Path.Combine(progDir, "蕉葉堂 巡回台帳.lnk");
                CreateShortcut(startPath, exePath, targetDir, "蕉葉堂 巡回台帳 — 戦前資料定期収集機", iconPath);

                // 建立開始功能表分類資料夾「蕉葉堂」
                string groupDir = System.IO.Path.Combine(progDir, "蕉葉堂");
                if (!Directory.Exists(groupDir)) {
                    Directory.CreateDirectory(groupDir);
                }
                CreateShortcut(System.IO.Path.Combine(groupDir, "蕉葉堂 巡回台帳.lnk"), exePath, targetDir, "蕉葉堂 巡回台帳 — 戦前資料定期収集機", iconPath);
                CreateShortcut(System.IO.Path.Combine(groupDir, "解除安裝 蕉葉堂巡回台帳.lnk"), uninstallerPath, targetDir, "解除安裝 蕉葉堂 巡回台帳", iconPath);
                if (File.Exists(updaterPath)) {
                    CreateShortcut(System.IO.Path.Combine(groupDir, "檢查更新 蕉葉堂巡回台帳.lnk"), updaterPath, targetDir, "檢查 蕉葉堂 巡回台帳 是否有新版本", iconPath, "--manual");
                }
            }

            // Step 5: 註冊到 Windows 設定 -> 應用程式 / 控制台 / Windows 搜尋索引
            UpdateProgress(95, (currentLang == "ja") ? "Windows アプリ台帳に登録中..." : "正在註冊至 Windows 應用程式清單...");
            RegisterInWindowsApps(targetDir, exePath, uninstallerPath, iconPath);

            // 觸發 Windows Shell 重新載入開始功能表與應用程式索引
            try {
                SHChangeNotify(0x08000000, 0x1000, IntPtr.Zero, IntPtr.Zero);
            } catch { }

            UpdateProgress(100, (currentLang == "ja") ? "配備完了。" : "部署完備。");
            Thread.Sleep(300);
        }

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);

        private void ExtractResourceToFile(string resourceName, string destPath) {
            try {
                Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(resourceName);
                if (s != null) {
                    using (s) {
                        using (FileStream fs = new FileStream(destPath, FileMode.Create, FileAccess.Write)) {
                            s.CopyTo(fs);
                        }
                    }
                } else {
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string local = System.IO.Path.Combine(baseDir, resourceName);
                    if (!File.Exists(local)) {
                        local = System.IO.Path.Combine(baseDir, "installer", resourceName);
                    }
                    if (File.Exists(local)) {
                        File.Copy(local, destPath, true);
                    }
                }
            } catch { }
        }

        private void RegisterInWindowsApps(string targetDir, string exePath, string uninstallerPath, string iconPath) {
            try {
                // 1. 註冊至 Windows "設定 -> 應用程式 -> 已安裝的應用程式" 與控制台
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk")) {
                    if (key != null) {
                        key.SetValue("DisplayName", "蕉葉堂 巡回台帳");
                        key.SetValue("DisplayVersion", BuildInfo.Version);
                        key.SetValue("Publisher", "蕉葉堂 / 蕉葉文庫 (Shoyodo Archive Desk)");
                        key.SetValue("DisplayIcon", iconPath + ",0");
                        key.SetValue("InstallLocation", targetDir);
                        key.SetValue("UninstallString", "\"" + uninstallerPath + "\"");
                        key.SetValue("QuietUninstallString", "\"" + uninstallerPath + "\" /quiet");
                        key.SetValue("EstimatedSize", 419430, RegistryValueKind.DWord);
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                        key.SetValue("Comments", "戰前古書・近代文獻定期巡回收集台帳");
                    }
                }

                // 2. 註冊至 Windows 搜尋與執行 (Win+S / Win+R App Paths)
                using (RegistryKey appKey = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\App Paths\蕉葉堂巡回台帳.exe")) {
                    if (appKey != null) {
                        appKey.SetValue("", exePath);
                        appKey.SetValue("Path", targetDir);
                    }
                }

                // 3. 註冊 Windows 開機自啟動 (Run at Windows Startup in background)
                using (RegistryKey runKey = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run")) {
                    // 升級／修復既有安裝時尊重使用者在設定中關閉的自啟動，不擅自重新開啟
                    if (runKey != null && (!isRepairMode || runKey.GetValue("ShoyodoArchiveDesk") != null)) {
                        runKey.SetValue("ShoyodoArchiveDesk", "\"" + exePath + "\" --hidden");
                    }
                }
            } catch { }
        }

        private void ExtractZipWithProgress(ZipArchive archive, string targetDir) {
            int total = archive.Entries.Count;
            int current = 0;
            foreach (ZipArchiveEntry entry in archive.Entries) {
                string destPath = System.IO.Path.Combine(targetDir, entry.FullName);
                if (string.IsNullOrEmpty(entry.Name)) {
                    if (!Directory.Exists(destPath)) {
                        Directory.CreateDirectory(destPath);
                    }
                } else {
                    string dir = System.IO.Path.GetDirectoryName(destPath);
                    if (!Directory.Exists(dir)) {
                        Directory.CreateDirectory(dir);
                    }
                    entry.ExtractToFile(destPath, true);
                }
                current++;
                if (current % 15 == 0 || current == total) {
                    int pct = 35 + (int)((double)current / total * 45);
                    UpdateProgress(pct, (currentLang == "ja") 
                        ? string.Format("リソースを展開中 ({0}/{1})...", current, total)
                        : string.Format("正在解壓縮核心資產 ({0}/{1})...", current, total));
                }
            }
        }

        private void CopyDirectory(string sourceDir, string destDir) {
            Directory.CreateDirectory(destDir);
            foreach (string file in Directory.GetFiles(sourceDir)) {
                string targetFile = System.IO.Path.Combine(destDir, System.IO.Path.GetFileName(file));
                File.Copy(file, targetFile, true);
            }
            foreach (string subDir in Directory.GetDirectories(sourceDir)) {
                string targetSubDir = System.IO.Path.Combine(destDir, System.IO.Path.GetFileName(subDir));
                CopyDirectory(subDir, targetSubDir);
            }
        }

        // 必須與 electron/main.cjs 的 app.setAppUserModelId 一致
        private const string AppUserModelId = "com.shoyodo.oldthingsearch";

        private static void SetAppUserModelId(object link, string appId) {
            IntPtr str = IntPtr.Zero;
            try {
                IPropertyStore store = (IPropertyStore)link;
                PropertyKey key = new PropertyKey { fmtid = new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"), pid = 5 }; // PKEY_AppUserModel_ID
                str = Marshal.StringToCoTaskMemUni(appId);
                PropVariant pv = new PropVariant { vt = 31, pointer = str }; // VT_LPWSTR
                int hr = store.SetValue(ref key, ref pv);
                if (hr == 0) hr = store.Commit();
                if (hr != 0) Log("Set AUMID hr=0x" + hr.ToString("X8"));
            } catch (Exception ex) {
                Log("Set AUMID failed: " + ex.Message);
            } finally {
                if (str != IntPtr.Zero) Marshal.FreeCoTaskMem(str);
            }
        }

        private void CreateShortcut(string shortcutPath, string targetExe, string workDir, string description, string iconPath, string arguments = null) {
            // 主要方案：原生 IShellLink（不依賴 Windows Script Host，公司/學校電腦停用 WSH 時仍可建立）
            try {
                IShellLinkW link = (IShellLinkW)new CShellLink();
                link.SetPath(targetExe);
                if (!string.IsNullOrEmpty(arguments)) link.SetArguments(arguments);
                link.SetWorkingDirectory(workDir);
                link.SetDescription(description);
                link.SetIconLocation(!string.IsNullOrEmpty(iconPath) && File.Exists(iconPath) ? iconPath : targetExe, 0);
                // 主程式捷徑寫入與 app.setAppUserModelId 相同的 AppUserModelID，
                // 工作列才能把執行中的視窗對應回此捷徑並取得正確圖示（否則可能顯示空白圖示）
                if (targetExe.EndsWith("蕉葉堂巡回台帳.exe", StringComparison.OrdinalIgnoreCase)) {
                    SetAppUserModelId(link, AppUserModelId);
                }
                ((System.Runtime.InteropServices.ComTypes.IPersistFile)link).Save(shortcutPath, false);
                Marshal.ReleaseComObject(link);
                if (File.Exists(shortcutPath)) return;
            } catch (Exception ex) {
                Log("IShellLink failed for " + shortcutPath + ": " + ex.Message);
            }
            // 備援方案：WScript.Shell
            try {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetExe;
                if (!string.IsNullOrEmpty(arguments)) shortcut.Arguments = arguments;
                shortcut.WorkingDirectory = workDir;
                shortcut.Description = description;
                shortcut.IconLocation = !string.IsNullOrEmpty(iconPath) ? iconPath + ",0" : targetExe + ",0";
                shortcut.Save();
            } catch (Exception ex) {
                Log("WScript shortcut failed for " + shortcutPath + ": " + ex.Message);
            }
        }
    }

    [ComImport, Guid("00021401-0000-0000-C000-000000000046")]
    internal class CShellLink { }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    internal interface IPropertyStore {
        [PreserveSig] int GetCount(out uint cProps);
        [PreserveSig] int GetAt(uint iProp, out PropertyKey pkey);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant pv);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant pv);
        [PreserveSig] int Commit();
    }

    [StructLayout(LayoutKind.Sequential, Pack = 4)]
    internal struct PropertyKey { public Guid fmtid; public uint pid; }

    // PROPVARIANT（僅用到 VT_LPWSTR）：vt 於偏移 0，字串指標於偏移 8；保留 24 位元組以符合 x64 大小
    [StructLayout(LayoutKind.Explicit, Size = 24)]
    internal struct PropVariant {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(8)] public IntPtr pointer;
    }

    [ComImport, InterfaceType(ComInterfaceType.InterfaceIsIUnknown), Guid("000214F9-0000-0000-C000-000000000046")]
    internal interface IShellLinkW {
        void GetPath([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszFile, int cch, IntPtr pfd, int fFlags);
        void GetIDList(out IntPtr ppidl);
        void SetIDList(IntPtr pidl);
        void GetDescription([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszName, int cch);
        void SetDescription([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetWorkingDirectory([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszDir, int cch);
        void SetWorkingDirectory([MarshalAs(UnmanagedType.LPWStr)] string pszDir);
        void GetArguments([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszArgs, int cch);
        void SetArguments([MarshalAs(UnmanagedType.LPWStr)] string pszArgs);
        void GetHotkey(out short pwHotkey);
        void SetHotkey(short wHotkey);
        void GetShowCmd(out int piShowCmd);
        void SetShowCmd(int iShowCmd);
        void GetIconLocation([Out, MarshalAs(UnmanagedType.LPWStr)] System.Text.StringBuilder pszIconPath, int cch, out int piIcon);
        void SetIconLocation([MarshalAs(UnmanagedType.LPWStr)] string pszIconPath, int iIcon);
        void SetRelativePath([MarshalAs(UnmanagedType.LPWStr)] string pszPathRel, int dwReserved);
        void Resolve(IntPtr hwnd, int fFlags);
        void SetPath([MarshalAs(UnmanagedType.LPWStr)] string pszFile);
    }

    // 命令列參數
    //   --update           由更新程式啟動：直接升級既有安裝，不顯示設定畫面
    //   --launch           完成後自動開啟台帳
    //   --no-self-update   不檢查線上新版安裝程式
    //   --replace <path>   自我更新後，以本檔覆蓋舊版安裝程式
    //   --old-pid <pid>    等待舊版安裝程式結束
    //   --lang ja|zh       介面語言
    public static class InstallerOptions {
        public static bool UpdateMode, LaunchAfter, NoSelfUpdate;
        public static string ReplacePath, Lang;
        public static int OldPid;

        public static void Parse(string[] args) {
            for (int i = 0; i < args.Length; i++) {
                string a = args[i].ToLowerInvariant();
                if (a == "--update") UpdateMode = true;
                else if (a == "--launch") LaunchAfter = true;
                else if (a == "--no-self-update") NoSelfUpdate = true;
                else if (a == "--replace" && i + 1 < args.Length) ReplacePath = args[++i];
                else if (a == "--old-pid" && i + 1 < args.Length) int.TryParse(args[++i], out OldPid);
                else if (a == "--lang" && i + 1 < args.Length) Lang = args[++i];
            }
            if (Environment.GetEnvironmentVariable("SHOYODO_NO_SELF_UPDATE") == "1") NoSelfUpdate = true;
        }
    }

    public static class Program {
        [STAThread]
        public static void Main(string[] args) {
            InstallerWindow.Log("==== Installer v" + BuildInfo.Version + " start on " + Environment.OSVersion + ", 64-bit OS=" + Environment.Is64BitOperatingSystem + ", user=" + Environment.UserName + ", args=" + string.Join(" ", args));
            InstallerOptions.Parse(args);

            // 0. 由舊版安裝程式自我更新而啟動：先等舊版結束，再把自己複製回舊檔位置完成「取代」
            if (InstallerOptions.OldPid > 0) {
                try { Process.GetProcessById(InstallerOptions.OldPid).WaitForExit(15000); } catch { }
            }
            if (!string.IsNullOrEmpty(InstallerOptions.ReplacePath)) {
                ReplaceOldInstaller(InstallerOptions.ReplacePath);
            }

            // 1. 同時只允許一個安裝程式執行（避免連點兩下造成兩份同時解壓互相覆寫）
            bool createdNew;
            using (Mutex mutex = new Mutex(true, @"Local\ShoyodoArchiveDeskInstaller", out createdNew)) {
                if (!createdNew) {
                    MessageBox.Show("安裝程式已經在執行中。\nインストーラーは既に起動しています。", "蕉葉堂 巡回台帳", MessageBoxButton.OK, MessageBoxImage.Information);
                    return;
                }

                // 2. 系統需求：台帳核心為 64 位元 Electron，需 64 位元 Windows 10 以上
                string req = CheckSystemRequirements();
                if (req != null) {
                    InstallerWindow.Log("Requirement failed: " + req);
                    MessageBox.Show(req, "蕉葉堂 巡回台帳 — 無法安裝", MessageBoxButton.OK, MessageBoxImage.Error);
                    return;
                }

                var app = new Application();
                // 3. 任何未預期錯誤都以對話框呈現並寫入記錄檔，而不是直接閃退
                app.DispatcherUnhandledException += (s, e) => {
                    InstallerWindow.Log("Unhandled: " + e.Exception);
                    MessageBox.Show("安裝程式發生未預期錯誤：\n" + e.Exception.Message + "\n\n詳細記錄：" + InstallerWindow.LogPath,
                        "蕉葉堂 巡回台帳", MessageBoxButton.OK, MessageBoxImage.Error);
                    e.Handled = true;
                };
                AppDomain.CurrentDomain.UnhandledException += (s, e) => InstallerWindow.Log("Fatal: " + e.ExceptionObject);
                app.Run(new InstallerWindow());
            }
        }

        private static void ReplaceOldInstaller(string oldPath) {
            string self = Assembly.GetExecutingAssembly().Location;
            if (string.Equals(System.IO.Path.GetFullPath(oldPath), self, StringComparison.OrdinalIgnoreCase)) return;
            for (int i = 0; i < 20; i++) {
                try {
                    File.Copy(self, oldPath, true);
                    InstallerWindow.Log("Replaced old installer at " + oldPath);
                    return;
                } catch (Exception ex) {
                    if (i == 19) InstallerWindow.Log("Replace old installer failed: " + ex.Message);
                    Thread.Sleep(300);
                }
            }
        }

        private static string CheckSystemRequirements() {
            if (!Environment.Is64BitOperatingSystem) {
                return "此電腦為 32 位元 Windows，無法執行「蕉葉堂 巡回台帳」（需要 64 位元 Windows 10 / 11）。\nこのPCは32ビット版 Windows のため配備できません。";
            }
            // 未加 manifest 時 Environment.OSVersion 會回報 6.2，改讀登錄檔取得真實版本
            try {
                using (RegistryKey k = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion")) {
                    object major = k != null ? k.GetValue("CurrentMajorVersionNumber") : null;
                    if (major == null || Convert.ToInt32(major) < 10) {
                        return "此電腦的 Windows 版本過舊，「蕉葉堂 巡回台帳」需要 Windows 10 或 11。\nWindows 10 以降が必要です。";
                    }
                }
            } catch { }
            return null;
        }
    }
}
