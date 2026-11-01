using System;
using System.Diagnostics;
using System.IO;
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

namespace ShoyodoUninstaller {
    public class UninstallerWindow : Window {
        private string currentLang = "zh";

        // 色彩配置（與蕉葉堂一致）
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

        // 挽留與問卷卡片
        private Border cardSurvey;
        private Border cardProgress;
        private Border cardFarewell;

        // 挽留選項
        private TextBlock txtRetainTitle;
        private TextBlock txtRetainDesc;
        private Button btnRetainApp;
        private Button btnResetCacheOnly;

        // 問卷題目
        private TextBlock txtSurveyLabel;
        private CheckBox chkReason1;
        private TextBlock txtReason1;
        private CheckBox chkReason2;
        private TextBlock txtReason2;
        private CheckBox chkReason3;
        private TextBlock txtReason3;
        private CheckBox chkReason4;
        private TextBlock txtReason4;
        private TextBox txtFeedback;

        // 底部按鈕
        private TextBlock txtFootNote;
        private Button btnCancel;
        private Button btnConfirmUninstall;

        // 進度步驟元件
        private TextBlock txtProgressTitle;
        private ProgressBar prgBar;
        private TextBlock txtProgressStatus;
        private TextBlock txtProgressPct;

        // 道別完成元件
        private TextBlock txtFarewellTitle;
        private TextBlock txtFarewellDesc;
        private Button btnFarewellClose;

        private Button btnMaximize;
        private bool isMaximized = false;
        private Rect normalBounds;

        [DllImport("shell32.dll")]
        private static extern void SHChangeNotify(int wEventId, int uFlags, IntPtr dwItem1, IntPtr dwItem2);

        public UninstallerWindow() {
            Title = "蕉葉堂 巡回台帳 ・ 解除配備指南";
            Width = 820;
            Height = 590;
            MinWidth = 700;
            MinHeight = 500;
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
            UpdateLanguage();
        }

        private void BuildUI() {
            Grid rootGrid = new Grid();
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(44, GridUnitType.Pixel) });
            rootGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });

            // 1. 深墨頂部標題列
            Border titleBar = new Border {
                Background = BrushDarkBar,
                BorderBrush = new SolidColorBrush(Color.FromRgb(0x36, 0x30, 0x27)),
                BorderThickness = new Thickness(0, 0, 0, 1)
            };
            titleBar.MouseDown += (s, e) => {
                if (e.LeftButton == MouseButtonState.Pressed) {
                    if (e.ClickCount == 2) ToggleMaximize();
                    else DragMove();
                }
            };

            Grid titleGrid = new Grid();
            titleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            titleGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

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

            // 2. 自適應內容區
            Border contentBorder = new Border {
                Padding = new Thickness(40, 26, 40, 24),
                Background = BrushPaper
            };

            Grid mainGrid = new Grid();
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
            mainGrid.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

            // Header 區域
            StackPanel headerStack = new StackPanel { Margin = new Thickness(0, 0, 0, 16) };
            txtKicker = new TextBlock {
                FontFamily = FontRoman,
                FontSize = 11,
                Foreground = BrushInkFaint,
                Margin = new Thickness(0, 0, 0, 4),
                Text = "SHOYODO ARCHIVE DESK / UNINSTALLATION & FAREWELL"
            };
            txtPageTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 24,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                Margin = new Thickness(0, 0, 0, 6)
            };
            txtPageLead = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 12.5,
                Foreground = BrushInkSoft,
                LineHeight = 20
            };
            Border headerLine = new Border {
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(0, 0, 0, 1),
                Margin = new Thickness(0, 12, 0, 0)
            };

            headerStack.Children.Add(txtKicker);
            headerStack.Children.Add(txtPageTitle);
            headerStack.Children.Add(txtPageLead);
            headerStack.Children.Add(headerLine);
            Grid.SetRow(headerStack, 0);
            mainGrid.Children.Add(headerStack);

            // 中央卡片容器
            Grid cardContainer = new Grid {
                VerticalAlignment = VerticalAlignment.Stretch,
                HorizontalAlignment = HorizontalAlignment.Stretch
            };

            // 卡片 1：挽留與離別問卷卡片
            cardSurvey = CreateStepCard();
            ScrollViewer surveyScroll = new ScrollViewer {
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto,
                HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled
            };

            StackPanel surveyStack = new StackPanel();

            // 挽回區塊
            Border retainBox = new Border {
                Background = new SolidColorBrush(Color.FromRgb(0xFC, 0xFA, 0xF5)),
                BorderBrush = BrushShu,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(18, 14, 18, 14),
                Margin = new Thickness(0, 0, 0, 18)
            };
            Grid retainGrid = new Grid();
            retainGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
            retainGrid.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });

            StackPanel retainTextStack = new StackPanel();
            txtRetainTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 14,
                FontWeight = FontWeights.Bold,
                Foreground = BrushShu,
                Margin = new Thickness(0, 0, 0, 4)
            };
            txtRetainDesc = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 12,
                Foreground = BrushInkSoft,
                LineHeight = 18
            };
            retainTextStack.Children.Add(txtRetainTitle);
            retainTextStack.Children.Add(txtRetainDesc);
            Grid.SetColumn(retainTextStack, 0);
            retainGrid.Children.Add(retainTextStack);

            StackPanel retainBtnStack = new StackPanel {
                Orientation = Orientation.Horizontal,
                VerticalAlignment = VerticalAlignment.Center
            };
            btnRetainApp = CreateVermilionButton("［ 繼續保留台帳 ］", 12);
            btnRetainApp.Padding = new Thickness(16, 7, 16, 7);
            btnRetainApp.Click += (s, e) => Close();

            btnResetCacheOnly = CreateOutlinedButton("［ 僅重設快取 ］", 11);
            btnResetCacheOnly.Padding = new Thickness(12, 6, 12, 6);
            btnResetCacheOnly.Margin = new Thickness(8, 0, 0, 0);
            btnResetCacheOnly.Click += (s, e) => DoResetCache();

            retainBtnStack.Children.Add(btnRetainApp);
            retainBtnStack.Children.Add(btnResetCacheOnly);
            Grid.SetColumn(retainBtnStack, 1);
            retainGrid.Children.Add(retainBtnStack);

            retainBox.Child = retainGrid;
            surveyStack.Children.Add(retainBox);

            // 問卷題目區塊
            txtSurveyLabel = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                FontWeight = FontWeights.SemiBold,
                Foreground = BrushInk,
                Margin = new Thickness(0, 0, 0, 10)
            };
            surveyStack.Children.Add(txtSurveyLabel);

            chkReason1 = CreateReasonCheck(out txtReason1);
            chkReason2 = CreateReasonCheck(out txtReason2);
            chkReason3 = CreateReasonCheck(out txtReason3);
            chkReason4 = CreateReasonCheck(out txtReason4);

            surveyStack.Children.Add(chkReason1);
            surveyStack.Children.Add(chkReason2);
            surveyStack.Children.Add(chkReason3);
            surveyStack.Children.Add(chkReason4);

            txtFeedback = new TextBox {
                Height = 44,
                FontFamily = FontGothic,
                FontSize = 12,
                Foreground = BrushInk,
                Background = Brushes.White,
                BorderBrush = BrushHair,
                BorderThickness = new Thickness(1),
                Padding = new Thickness(8, 6, 8, 6),
                Margin = new Thickness(0, 10, 0, 0),
                TextWrapping = TextWrapping.Wrap,
                AcceptsReturn = true,
                VerticalScrollBarVisibility = ScrollBarVisibility.Auto
            };
            surveyStack.Children.Add(txtFeedback);

            surveyScroll.Content = surveyStack;
            cardSurvey.Child = surveyScroll;

            // 卡片 2：卸載進度展示
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

            // 卡片 3：道別完成畫面
            cardFarewell = CreateStepCard();
            cardFarewell.Visibility = Visibility.Collapsed;
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
                Text = "緣",
                FontFamily = FontMincho,
                FontSize = 30,
                FontWeight = FontWeights.Bold,
                Foreground = BrushShu,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            };
            sealLarge.Child = txtSealLarge;

            txtFarewellTitle = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 20,
                FontWeight = FontWeights.Bold,
                Foreground = BrushInk,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 10)
            };

            txtFarewellDesc = new TextBlock {
                FontFamily = FontMincho,
                FontSize = 13,
                Foreground = BrushInkSoft,
                LineHeight = 22,
                TextAlignment = TextAlignment.Center,
                HorizontalAlignment = HorizontalAlignment.Center,
                Margin = new Thickness(0, 0, 0, 20)
            };

            btnFarewellClose = CreateVermilionButton("［ 關閉並告別 ］", 13);
            btnFarewellClose.Padding = new Thickness(30, 8, 30, 8);
            btnFarewellClose.HorizontalAlignment = HorizontalAlignment.Center;
            btnFarewellClose.Click += (s, e) => FinalizeSelfDeleteAndClose();

            cmpStack.Children.Add(sealLarge);
            cmpStack.Children.Add(txtFarewellTitle);
            cmpStack.Children.Add(txtFarewellDesc);
            cmpStack.Children.Add(btnFarewellClose);
            cardFarewell.Child = cmpStack;

            cardContainer.Children.Add(cardSurvey);
            cardContainer.Children.Add(cardProgress);
            cardContainer.Children.Add(cardFarewell);
            Grid.SetRow(cardContainer, 1);
            mainGrid.Children.Add(cardContainer);

            // 底部按鈕區
            Grid footGrid = new Grid { Margin = new Thickness(0, 16, 0, 0) };
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

            btnCancel = CreateVermilionButton("［ 留步保留 ］", 12);
            btnCancel.Padding = new Thickness(22, 8, 22, 8);
            btnCancel.Margin = new Thickness(0, 0, 12, 0);
            btnCancel.Click += (s, e) => Close();

            btnConfirmUninstall = CreateOutlinedButton("［ 忍痛徹底解除安裝 ］", 12);
            btnConfirmUninstall.Padding = new Thickness(18, 8, 18, 8);
            btnConfirmUninstall.Click += (s, e) => StartUninstallWorkflow();

            btnPanel.Children.Add(btnCancel);
            btnPanel.Children.Add(btnConfirmUninstall);
            Grid.SetColumn(btnPanel, 1);
            footGrid.Children.Add(btnPanel);

            Grid.SetRow(footGrid, 2);
            mainGrid.Children.Add(footGrid);

            contentBorder.Child = mainGrid;
            Grid.SetRow(contentBorder, 1);
            rootGrid.Children.Add(contentBorder);

            Content = rootGrid;
        }

        private CheckBox CreateReasonCheck(out TextBlock txtLabel) {
            CheckBox chk = new CheckBox {
                Margin = new Thickness(0, 3, 0, 5),
                VerticalContentAlignment = VerticalAlignment.Center
            };
            txtLabel = new TextBlock {
                FontFamily = FontGothic,
                FontSize = 12,
                Foreground = BrushInk,
                Margin = new Thickness(6, 0, 0, 0)
            };
            chk.Content = txtLabel;
            return chk;
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
                Padding = new Thickness(28, 22, 28, 22),
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

        private void DoResetCache() {
            // 實際清除 Electron 的暫存資料夾；「Local Storage / IndexedDB」內的台帳資料與已見記錄全部保留
            string userData = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "old-thing-search-desktop");
            string[] cacheDirs = { "Cache", "Code Cache", "GPUCache", "DawnGraphiteCache", "DawnWebGPUCache", "GrShaderCache", "GPUPersistentCache", "ShaderCache", "Service Worker\\CacheStorage" };
            foreach (Process p in Process.GetProcessesByName("蕉葉堂巡回台帳")) {
                try { p.Kill(); p.WaitForExit(3000); } catch { }
            }
            foreach (string d in cacheDirs) {
                try {
                    string full = System.IO.Path.Combine(userData, d);
                    if (Directory.Exists(full)) Directory.Delete(full, true);
                } catch { }
            }
            string msg = (currentLang == "ja") 
                ? "台帳の検索インデックスおよび一時キャッシュのみを初期化しました。\nプログラム自体は保持されますので、引き続き快適にご利用いただけます。" 
                : "已為您重設巡回台帳的快取與搜尋暫存。\n主程式已完整保留，您可隨時繼續秒開使用！";
            string caption = (currentLang == "ja") ? "キャッシュ初期化完了" : "快取清理完畢";
            MessageBox.Show(msg, caption, MessageBoxButton.OK, MessageBoxImage.Information);
            Close();
        }

        private void UpdateLanguage() {
            if (currentLang == "ja") {
                Title = "蕉葉堂 巡回台帳 — 解除配備案内";
                btnToggleLang.Content = "切換為繁體中文";
                txtTitleBar.Text = "蕉葉堂 巡回台帳 ・ 解除配備案内";
                txtPageTitle.Text = "しばし留まりて、ご縁のゆくえ";
                txtPageLead.Text = "古書との巡り合いは一期一会にございます。もし不備やご不便がございましたらご意見をお寄せください。文庫はいつでもお待ちしております。";
                txtRetainTitle.Text = "【文庫からのご提案】台帳をそのまま保持しませんか？";
                txtRetainDesc.Text = "容量は約 410 MB です。削除せず残しておくだけで、必要な時にいつでも 0.5 秒で古書市場の最新相場を照会いただけます。";
                btnRetainApp.Content = "［ 台帳を使い続ける ］";
                btnResetCacheOnly.Content = "［ キャッシュのみ整理 ］";
                txtSurveyLabel.Text = "よろしければ、配備を解除される理由をお聞かせください（複数選択可）：";
                txtReason1.Text = "巡回走査の速度や通信接続の安定性への課題";
                txtReason2.Text = "戦前資料・古本を探す機会が一時的に少なくなった";
                txtReason3.Text = "通常のWebブラウザでの手動検索で充分と感じた";
                txtReason4.Text = "ディスク空き容量の整理、またはPCの環境移行";
                txtFeedback.ToolTip = "文庫へのご意見・ご要望がございましたら自由にご記入ください";
                btnCancel.Content = "［ 留まりて保持 ］";
                btnConfirmUninstall.Content = "［ 惜別・配備を解除する ］";
                txtProgressTitle.Text = "台帳の配備を解除中...";
                txtFarewellTitle.Text = "配備の解除が完了しました";
                txtFarewellDesc.Text = "「蕉葉堂 巡回台帳」は正常にコンピュータより取り除かれました。\nこれまで古書探索をご一緒できましたご縁に、心より御礼申し上げます。";
                btnFarewellClose.Content = "［ 閉じて別れを告げる ］";
            } else {
                Title = "蕉葉堂 巡回台帳 — 解除安裝指南";
                btnToggleLang.Content = "日本語に切替";
                txtTitleBar.Text = "蕉葉堂 巡回台帳 ・ 告別與解除安裝";
                txtPageTitle.Text = "古書因緣 ・ 願君留步";
                txtPageLead.Text = "古書文獻的相逢是一期一會。若台帳尚有不如意之處，請惠賜您的寶貴意見；蕉葉文庫隨時歡迎您的歸來。";
                txtRetainTitle.Text = "【文庫挽留建議】是否願意繼續保留台帳？";
                txtRetainDesc.Text = "本台帳僅佔約 410 MB 空間。日常保留於電腦中，日後若有戰前古籍、近代文獻探索需求，隨時點擊即可 0.5 秒秒開查價。";
                btnRetainApp.Content = "［ 留步保留台帳 ］";
                btnResetCacheOnly.Content = "［ 僅重設快取暫存 ］";
                txtSurveyLabel.Text = "請告訴我們您選擇離別的主要原因（可多選，助我們精進改進）：";
                txtReason1.Text = "古物巡行爬取速度或連線穩定度不如預期";
                txtReason2.Text = "近期暫時無戰前資料與古本古籍之收藏需求";
                txtReason3.Text = "習慣直接使用一般網頁瀏覽器手動搜尋比價";
                txtReason4.Text = "整理電腦硬碟儲存空間或更換電腦設備";
                txtFeedback.ToolTip = "若有其他寶貴建議，歡迎於此留言惠賜...";
                btnCancel.Content = "［ 我再想想，保留台帳 ］";
                btnConfirmUninstall.Content = "［ 忍痛徹底解除安裝 ］";
                txtProgressTitle.Text = "正在抹除台帳登記與印記檔案...";
                txtFarewellTitle.Text = "台帳配置已順利解除";
                txtFarewellDesc.Text = "「蕉葉堂 巡回台帳」已完全自您的電腦中解除安裝。\n感謝這段時光您與蕉葉堂的相遇。願好書常伴，期待未來於書海中與您再度重逢。";
                btnFarewellClose.Content = "［ 關閉並告別 ］";
            }
        }

        private async void StartUninstallWorkflow() {
            cardSurvey.Visibility = Visibility.Collapsed;
            cardProgress.Visibility = Visibility.Visible;
            btnCancel.Visibility = Visibility.Collapsed;
            btnConfirmUninstall.IsEnabled = false;

            await Task.Run(() => PerformUninstallation());

            cardProgress.Visibility = Visibility.Collapsed;
            cardFarewell.Visibility = Visibility.Visible;

            txtPageTitle.Text = (currentLang == "ja") ? "配備解除完了" : "解除安裝完畢";
            txtPageLead.Text = (currentLang == "ja") 
                ? "すべての登録情報とリソースが正常に抹消されました。" 
                : "所有登錄檔資訊與台帳核心檔案已完全抹除完畢。";
        }

        private void UpdateProgress(int pct, string status) {
            Dispatcher.Invoke(() => {
                prgBar.Value = pct;
                txtProgressPct.Text = pct + "%";
                txtProgressStatus.Text = status;
            });
        }

        private void PerformUninstallation() {
            UpdateProgress(15, (currentLang == "ja") ? "実行中の台帳プロセスを停止中..." : "正在終止背景執行之台帳行程...");
            Thread.Sleep(300);

            // 1. 關閉執行中行程
            foreach (Process p in Process.GetProcessesByName("蕉葉堂巡回台帳")) {
                try {
                    p.Kill();
                    p.WaitForExit(1500);
                } catch { }
            }

            // 2. 登錄檔抹除
            UpdateProgress(40, (currentLang == "ja") ? "システム台帳の登録情報を抹消中..." : "正在從 Windows 應用程式清單撤銷登記...");
            Thread.Sleep(300);
            try {
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk", false);
            } catch { }
            try {
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\App Paths\蕉葉堂巡回台帳.exe", false);
            } catch { }
            try {
                using (RegistryKey runKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) {
                    if (runKey != null) {
                        runKey.DeleteValue("ShoyodoArchiveDesk", false);
                    }
                }
            } catch { }

            // 3. 捷徑抹除
            UpdateProgress(65, (currentLang == "ja") ? "デスクトップ及びメニューの印記を削除中..." : "正在移除桌面與開始功能表書誌印記...");
            Thread.Sleep(300);
            try {
                string deskPath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "蕉葉堂 巡回台帳.lnk");
                if (File.Exists(deskPath)) File.Delete(deskPath);
            } catch { }

            try {
                string progDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string lnk = System.IO.Path.Combine(progDir, "蕉葉堂 巡回台帳.lnk");
                if (File.Exists(lnk)) File.Delete(lnk);

                string groupDir = System.IO.Path.Combine(progDir, "蕉葉堂");
                if (Directory.Exists(groupDir)) Directory.Delete(groupDir, true);
            } catch { }

            // 4. 通知 Windows Shell 即刻刷新
            try {
                SHChangeNotify(0x08000000, 0x1000, IntPtr.Zero, IntPtr.Zero);
            } catch { }

            // 5. 抹除程式庫資產（保留自身執行檔，稍後於關閉時自刪）
            UpdateProgress(90, (currentLang == "ja") ? "台帳コアおよび書誌リソースを消去中..." : "正在清理 Chromium 核心與台帳資產檔案...");
            Thread.Sleep(400);

            // 只刪除「確認過」的安裝目錄（見 InstallLocator），絕不刪除 uninstall.exe 剛好所在的任意資料夾
            try {
                string targetDir = InstallLocator.TargetDir;
                if (targetDir != null) {
                    string selfPath = Process.GetCurrentProcess().MainModule.FileName;
                    foreach (string file in Directory.GetFiles(targetDir)) {
                        if (!string.Equals(System.IO.Path.GetFullPath(file), selfPath, StringComparison.OrdinalIgnoreCase)) {
                            try { File.Delete(file); } catch { }
                        }
                    }
                    foreach (string dir in Directory.GetDirectories(targetDir)) {
                        try { Directory.Delete(dir, true); } catch { }
                    }
                }
            } catch { }

            UpdateProgress(100, (currentLang == "ja") ? "解除完了。" : "解除完畢。");
            Thread.Sleep(300);
        }

        private void FinalizeSelfDeleteAndClose() {
            try {
                string currentDir = InstallLocator.TargetDir;
                if (currentDir == null) { Close(); return; }
                string cleanScript = string.Format("timeout /t 1 /nobreak >nul & rd /s /q \"{0}\"", currentDir);
                ProcessStartInfo psi = new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c " + cleanScript,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(psi);
            } catch { }
            Close();
        }
    }

    public static class Program {
        [STAThread]
        public static void Main(string[] args) {
            // 先於刪除登錄檔前鎖定安裝目錄
            InstallLocator.Init();
            bool isSilent = false;
            foreach (string arg in args) {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) || 
                    arg.Equals("/quiet", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/silent", StringComparison.OrdinalIgnoreCase)) {
                    isSilent = true;
                    break;
                }
            }

            if (isSilent) {
                DoSilentUninstall();
                return;
            }

            var app = new Application();
            app.Run(new UninstallerWindow());
        }

        private static void DoSilentUninstall() {
            try {
                foreach (Process p in Process.GetProcessesByName("蕉葉堂巡回台帳")) {
                    try { p.Kill(); p.WaitForExit(1500); } catch { }
                }
                try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk", false); } catch { }
                try { Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\App Paths\蕉葉堂巡回台帳.exe", false); } catch { }
                try {
                    using (RegistryKey runKey = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true)) {
                        if (runKey != null) runKey.DeleteValue("ShoyodoArchiveDesk", false);
                    }
                } catch { }
                try {
                    string deskPath = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "蕉葉堂 巡回台帳.lnk");
                    if (File.Exists(deskPath)) File.Delete(deskPath);
                } catch { }
                try {
                    string progDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                    string lnk = System.IO.Path.Combine(progDir, "蕉葉堂 巡回台帳.lnk");
                    if (File.Exists(lnk)) File.Delete(lnk);
                    string groupDir = System.IO.Path.Combine(progDir, "蕉葉堂");
                    if (Directory.Exists(groupDir)) Directory.Delete(groupDir, true);
                } catch { }

                string currentDir = InstallLocator.TargetDir;
                if (currentDir == null) return;
                string cleanScript = string.Format("timeout /t 1 /nobreak >nul & rd /s /q \"{0}\"", currentDir);
                Process.Start(new ProcessStartInfo {
                    FileName = "cmd.exe",
                    Arguments = "/c " + cleanScript,
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    WindowStyle = ProcessWindowStyle.Hidden
                });
            } catch { }
        }
    }
    // 安全鎖定「真正的安裝目錄」：
    // 1) 登錄檔 InstallLocation；2) uninstall.exe 所在目錄。
    // 兩者都必須確實含有主程式 蕉葉堂巡回台帳.exe，且不可是磁碟根目錄、使用者資料夾、桌面、文件、下載、Windows、Program Files 等系統位置。
    public static class InstallLocator {
        public const string AppExe = "蕉葉堂巡回台帳.exe";
        public static string TargetDir { get; private set; }

        public static void Init() {
            string fromReg = null;
            try {
                using (RegistryKey key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\ShoyodoArchiveDesk")) {
                    if (key != null) fromReg = key.GetValue("InstallLocation") as string;
                }
            } catch { }

            if (IsSafeInstallDir(fromReg)) { TargetDir = Normalize(fromReg); return; }
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            if (IsSafeInstallDir(baseDir)) { TargetDir = Normalize(baseDir); return; }
            TargetDir = null;
        }

        private static string Normalize(string dir) {
            return System.IO.Path.GetFullPath(dir).TrimEnd('\\', '/');
        }

        public static bool IsSafeInstallDir(string dir) {
            try {
                if (string.IsNullOrWhiteSpace(dir) || !Directory.Exists(dir)) return false;
                string full = Normalize(dir);
                if (!File.Exists(System.IO.Path.Combine(full, AppExe))) return false;

                string root = System.IO.Path.GetPathRoot(full).TrimEnd('\\', '/');
                if (string.Equals(full, root, StringComparison.OrdinalIgnoreCase)) return false;

                Environment.SpecialFolder[] forbidden = {
                    Environment.SpecialFolder.UserProfile, Environment.SpecialFolder.Desktop,
                    Environment.SpecialFolder.DesktopDirectory, Environment.SpecialFolder.MyDocuments,
                    Environment.SpecialFolder.Windows, Environment.SpecialFolder.System,
                    Environment.SpecialFolder.ProgramFiles, Environment.SpecialFolder.ProgramFilesX86,
                    Environment.SpecialFolder.ApplicationData, Environment.SpecialFolder.LocalApplicationData,
                    Environment.SpecialFolder.Programs, Environment.SpecialFolder.StartMenu
                };
                foreach (Environment.SpecialFolder f in forbidden) {
                    string p = Environment.GetFolderPath(f);
                    if (!string.IsNullOrEmpty(p) && string.Equals(full, Normalize(p), StringComparison.OrdinalIgnoreCase)) return false;
                }
                string downloads = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
                if (string.Equals(full, Normalize(downloads), StringComparison.OrdinalIgnoreCase)) return false;
                string localPrograms = System.IO.Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
                if (string.Equals(full, Normalize(localPrograms), StringComparison.OrdinalIgnoreCase)) return false;

                // 開發用原始碼資料夾（含 package.json）也不可當作安裝目錄刪除
                if (File.Exists(System.IO.Path.Combine(full, "package.json"))) return false;
                return true;
            } catch {
                return false;
            }
        }
    }
}
