using System;
using System.Windows.Forms;

namespace MorpheusConfigurador;

static class Program
{
    [STAThread]
    static void Main()
    {
        Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
        Application.ThreadException += (sender, e) =>
        {
            MessageBox.Show($"Error no controlado en la aplicación:\n\n{e.Exception.Message}\n\nDetalle:\n{e.Exception.StackTrace}", 
                "Neo ERP - Error en Configurador", MessageBoxButtons.OK, MessageBoxIcon.Error);
        };
        AppDomain.CurrentDomain.UnhandledException += (sender, e) =>
        {
            if (e.ExceptionObject is Exception ex)
            {
                MessageBox.Show($"Error crítico en el dominio de la aplicación:\n\n{ex.Message}\n\nDetalle:\n{ex.StackTrace}", 
                    "Neo ERP - Error Crítico", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        };

        try
        {
            // Fuerza la red 100% administrada en C# sin depender de SNI DLLs nativas de C++
            AppContext.SetSwitch("Switch.Microsoft.Data.SqlClient.UseManagedNetworkingOnWindows", true);
            
            ApplicationConfiguration.Initialize();
            Application.Run(new MainForm());
        }
        catch (Exception ex)
        {
            MessageBox.Show($"Error al iniciar la interfaz del Configurador:\n\n{ex.Message}\n\nDetalle:\n{ex.StackTrace}", 
                "Neo ERP - Error de Inicio", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
