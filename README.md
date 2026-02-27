# LauncherChef

Launcher de Minecraft con gestion automatica de mods, sincronizacion remota y soporte multi-servidor. Construido con Electron.

## Caracteristicas

- **Login Premium y No Premium** - Autenticacion con Microsoft (Premium) o modo offline
- **Sincronizacion automatica de mods** - Descarga, verifica y actualiza mods automaticamente desde un repositorio remoto
- **Sincronizacion de configs** - Descarga configuraciones del servidor para que todos los jugadores tengan los mismos ajustes
- **Auto-actualizacion de lista de mods** - Al abrir el launcher, descarga la lista mas reciente del `distribution.json` desde GitHub
- **Multi-servidor** - Soporte para multiples servidores con diferentes mods y versiones
- **Verificacion SHA-256** - Valida la integridad de cada mod descargado
- **Interfaz moderna** - UI oscura con barra de progreso, logs en tiempo real y gestion visual de mods

## Estructura del proyecto

```
launcherchef/
├── main.js                    # Proceso principal de Electron
├── preload.js                 # Bridge entre main y renderer
├── package.json               # Dependencias y config de build
├── distribution.json          # Manifiesto de servidores y mods
├── distribution-example.json  # Ejemplo de distribution.json
├── config/
│   ├── settings.json          # Ajustes del launcher (RAM, Java, URL distro)
│   └── servers.json           # Cache local de servidores
├── src/
│   ├── pages/
│   │   └── index.html         # Interfaz del launcher
│   ├── js/
│   │   └── renderer.js        # Logica del frontend
│   ├── assets/
│   │   └── css/
│   │       └── style.css      # Estilos
│   └── lib/
│       ├── authHandler.js     # Autenticacion Microsoft/offline
│       ├── launchHandler.js   # Lanzamiento de Minecraft
│       └── modSyncHandler.js  # Sincronizacion de mods
└── tools/
    ├── generate-manifest.js   # Genera distribution.json desde la carpeta de mods
    ├── update-urls.js         # Actualiza URLs en distribution.json
    ├── package-configs.js     # Empaqueta configs en ZIP
    └── setup-github-hosting.bat # Script para configurar hosting en GitHub
```

## Requisitos

- [Node.js](https://nodejs.org/) v18+
- [Git](https://git-scm.com/)
- [GitHub CLI](https://cli.github.com/) (`gh`) - para subir mods al repositorio

## Instalacion (desarrollo)

```bash
# Clonar el repositorio
git clone https://github.com/CarlosFloresDev/launcherchef.git
cd launcherchef

# Instalar dependencias
npm install

# Ejecutar en modo desarrollo
npm start
```

## Compilar el ejecutable (.exe)

```bash
npm run build:win
```

El instalador se genera en `dist/LauncherChef-Setup-1.0.0.exe`.

> **Nota:** El .exe no esta firmado digitalmente. Windows SmartScreen mostrara una advertencia la primera vez. El usuario debe hacer clic en "Mas informacion" > "Ejecutar de todas formas".

## Como funciona la distribucion de mods

El launcher usa un archivo `distribution.json` alojado en GitHub que contiene la lista de servidores y sus mods. Cada vez que un usuario abre el launcher, descarga automaticamente este archivo para tener la lista mas reciente.

**Repositorio de mods:** Los archivos `.jar` se alojan como assets en un [GitHub Release](https://github.com/CarlosFloresDev/tortillaland-mods/releases/tag/v1).

**Flujo de actualizacion:**
1. Tu agregas un mod nuevo al release y al `distribution.json`
2. Subes el `distribution.json` actualizado a GitHub
3. Los usuarios abren el launcher y ven la lista actualizada
4. Al darle a "Jugar" o "Sincronizar", se descarga el mod automaticamente

## Agregar un nuevo mod

### Paso 1: Obtener info del mod

```bash
# Obtener el hash SHA-256
sha256sum ruta/al/mod.jar

# Obtener el tamano en bytes
stat --printf="%s" ruta/al/mod.jar
```

### Paso 2: Copiar el mod a tu instancia local

```bash
cp ruta/al/mod.jar minecraft_data/instances/tortillaland-2/mods/
```

### Paso 3: Subir el .jar al release de GitHub

```bash
gh release upload v1 ruta/al/mod.jar --repo CarlosFloresDev/tortillaland-mods --clobber
```

### Paso 4: Agregar la entrada al distribution.json

Edita `distribution.json` y agrega una entrada en orden alfabetico dentro del array `mods` del servidor:

```json
{
  "name": "NombreDelMod 1.21.1",
  "filename": "nombre-del-mod-1.21.1-1.0.0.jar",
  "url": "https://github.com/CarlosFloresDev/tortillaland-mods/releases/download/v1/nombre-del-mod-1.21.1-1.0.0.jar",
  "sha256": "hash_sha256_aqui",
  "size": 12345,
  "required": true
}
```

### Paso 5: Subir el distribution.json actualizado a GitHub

```bash
# Obtener el SHA actual del archivo en GitHub
SHA=$(gh api repos/CarlosFloresDev/tortillaland-mods/contents/distribution.json --jq '.sha')

# Crear el payload con Node.js
node -e "
const fs = require('fs'), os = require('os'), path = require('path');
const content = fs.readFileSync('distribution.json').toString('base64');
const payload = JSON.stringify({
  message: 'Agregar mod NombreDelMod',
  content: content,
  sha: '${SHA}'
});
fs.writeFileSync(path.join(os.tmpdir(), 'gh_payload.json'), payload);
console.log('Payload creado');
"

# Subir a GitHub
gh api repos/CarlosFloresDev/tortillaland-mods/contents/distribution.json \
  -X PUT --input "$(node -e "console.log(require('os').tmpdir() + '/gh_payload.json')")"
```

### Resumen rapido (todos los pasos en uno)

```bash
# Variables - cambiar estos valores
MOD_FILE="ruta/al/nuevo-mod.jar"
MOD_NAME="NuevoMod 1.21.1"
REPO="CarlosFloresDev/tortillaland-mods"

# 1. Copiar a instancia local
cp "$MOD_FILE" minecraft_data/instances/tortillaland-2/mods/

# 2. Subir al release
gh release upload v1 "$MOD_FILE" --repo $REPO --clobber

# 3. Obtener hash y tamano
sha256sum "$MOD_FILE"
stat --printf="%s" "$MOD_FILE"

# 4. Editar distribution.json (agregar entrada manualmente)
# 5. Subir distribution.json (ver Paso 5 arriba)
```

## Eliminar un mod

1. Elimina la entrada del mod en `distribution.json`
2. Sube el `distribution.json` actualizado (ver Paso 5 de agregar)
3. La proxima vez que los usuarios sincronicen, el mod se eliminara automaticamente de su carpeta

## Configuracion del launcher en el cliente

En la seccion **Settings** del launcher, el usuario debe configurar:

- **URL de Distribucion:** `https://raw.githubusercontent.com/CarlosFloresDev/tortillaland-mods/main/distribution.json`
- **RAM:** Minimo 1024 MB, recomendado 4096-8192 MB
- Hacer clic en **"Cargar"** y luego **"Guardar Ajustes"**

Una vez configurado, el launcher se auto-actualiza cada vez que se abre.

## Scripts disponibles

| Comando | Descripcion |
|---------|-------------|
| `npm start` | Ejecutar el launcher en modo normal |
| `npm run dev` | Ejecutar en modo desarrollo |
| `npm run build:win` | Compilar instalador .exe para Windows |
| `npm run build:linux` | Compilar para Linux |
| `npm run generate-manifest` | Generar distribution.json desde la carpeta de mods |
| `npm run update-urls` | Actualizar URLs en distribution.json |

## Tecnologias

- **Electron** - Framework de escritorio
- **minecraft-launcher-core** - Lanzamiento de Minecraft
- **msmc** - Autenticacion con Microsoft
- **adm-zip** - Extraccion de configuraciones
- **electron-builder** - Empaquetado y distribucion

## Licencia

MIT
