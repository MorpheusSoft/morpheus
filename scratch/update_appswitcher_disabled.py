import os

files = [
    "neo-erp-web/apps/neo-core/src/components/layout/AppSwitcher.tsx",
    "neo-erp-web/apps/neo-inventory/src/components/layout/AppSwitcher.tsx",
    "neo-erp-web/apps/neo-pricing/src/components/layout/AppSwitcher.tsx",
    "neo-erp-web/apps/neo-purchases/src/components/layout/AppSwitcher.tsx",
    "neo-erp-web/apps/neo-wms/src/components/layout/AppSwitcher.tsx"
]

target = """  const extraApps = [
    { name: "Kiosco (Habladores)", icon: "pi pi-tablet", color: "text-violet-600", bg: "bg-violet-50", href: isProd ? "https://costos.qa.morpheussoft.net/costos/habladores/tienda" : "http://localhost:4004/costos/habladores/tienda" },
    { name: "Consultor Móvil", icon: "pi pi-mobile", color: "text-indigo-600", bg: "bg-indigo-50", href: isProd ? "https://costos.qa.morpheussoft.net/costos/kiosco/consultor" : "http://localhost:4004/costos/kiosco/consultor" },
  ];"""

replacement = """  const extraApps = [
    { name: "Kiosco (Habladores)", icon: "pi pi-tablet", color: "text-violet-600", bg: "bg-violet-50", href: isProd ? "https://costos.qa.morpheussoft.net/costos/habladores/tienda" : "http://localhost:4004/costos/habladores/tienda", disabled: false },
    { name: "Consultor Móvil", icon: "pi pi-mobile", color: "text-indigo-600", bg: "bg-indigo-50", href: isProd ? "https://costos.qa.morpheussoft.net/costos/kiosco/consultor" : "http://localhost:4004/costos/kiosco/consultor", disabled: false },
  ];"""

for f in files:
    path = os.path.join("/home/lzambrano/Desarrollo/Morpheus", f)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as file:
            content = file.read()
        
        content_norm = content.replace("\r\n", "\n")
        target_norm = target.replace("\r\n", "\n")
        replacement_norm = replacement.replace("\r\n", "\n")
        
        if target_norm in content_norm:
            new_content = content_norm.replace(target_norm, replacement_norm)
            with open(path, "w", encoding="utf-8") as file:
                file.write(new_content)
            print(f"[OK] Updated {f}")
        else:
            print(f"[WARN] Target not found in {f}")
    else:
        print(f"[ERROR] File not found: {f}")
