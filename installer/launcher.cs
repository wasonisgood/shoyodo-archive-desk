using System;
using System.Diagnostics;
using System.IO;

namespace ShoyodoInstaller {
    static class Program {
        [STAThread]
        static void Main() {
            try {
                string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                string htaPath = Path.Combine(baseDir, "installer", "install-gui.hta");
                if (!File.Exists(htaPath)) {
                    htaPath = Path.Combine(baseDir, "install-gui.hta");
                }

                if (File.Exists(htaPath)) {
                    ProcessStartInfo psi = new ProcessStartInfo {
                        FileName = "mshta.exe",
                        Arguments = "\"" + htaPath + "\"",
                        UseShellExecute = true,
                        WorkingDirectory = Path.GetDirectoryName(htaPath)
                    };
                    Process.Start(psi);
                } else {
                    System.Windows.Forms.MessageBox.Show(
                        "未找到安裝導航檔案 (install-gui.hta)。\n請確認檔案完整性。",
                        "蕉葉堂 巡回台帳 安裝程式",
                        System.Windows.Forms.MessageBoxButtons.OK,
                        System.Windows.Forms.MessageBoxIcon.Exclamation
                    );
                }
            } catch (Exception ex) {
                System.Windows.Forms.MessageBox.Show("啟動安裝程式時發生錯誤：" + ex.Message);
            }
        }
    }
}
