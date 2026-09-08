using System;
using System.Windows.Forms;

namespace MorpheusConfigurador;

static class Program
{
    [STAThread]
    static void Main()
    {
        // Fuerza la red 100% administrada en C# sin depender de SNI DLLs nativas de C++
        AppContext.SetSwitch("Switch.Microsoft.Data.SqlClient.UseManagedNetworkingOnWindows", true);
        
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }
}
