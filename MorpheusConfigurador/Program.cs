using System;
using System.Windows.Forms;

namespace MorpheusConfigurador;

static class Program
{
    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
