## Objetivo del paso

EF Core ya conoce tu modelo, pero la base de datos no existe. En este paso la crearás, y lo harás de la forma en que se hace en proyectos reales: con **migraciones**. Vas a:

1. Entender qué es una migración y por qué el esquema de la base de datos se **versiona** junto con el código.
2. Crear la migración `InitialCreate` con **`Add-Migration`** y leer los archivos que genera.
3. Deshacer una migración que aún no aplicaste, con **`Remove-Migration`**.
4. Ver el SQL que se ejecutará, con **`Script-Migration`**.
5. Crear la base de datos con **`Update-Database`** y mirar dentro del archivo `tasktracker.db`.
6. Conocer el equivalente de cada comando en la CLI **`dotnet ef`** y las limitaciones de SQLite con las migraciones.

## El problema: el esquema también cambia

Tu modelo no se quedará como está: en el paso 9 añadirás tareas y en el paso 11 etiquetas. Cada cambio en las clases exige un cambio en la base de datos: tablas nuevas, columnas nuevas, claves foráneas…

Podrías escribir esos cambios en SQL a mano, pero aparecen preguntas incómodas:

- ¿Qué cambios tiene ya aplicados **tu** base de datos? ¿Y la de tu compañero? ¿Y la de producción?
- ¿Cómo te aseguras de que el SQL coincide **exactamente** con tus clases?
- Si algo sale mal, ¿cómo vuelves atrás?

:::concept Migración
Una **migración** es un archivo de C#, generado por EF Core, que describe **cómo pasar el esquema de la base de datos de una versión a la siguiente**. Tiene dos métodos:

- **`Up`**: aplica el cambio (crear la tabla `Projects`).
- **`Down`**: lo deshace (borrar la tabla `Projects`).

Las migraciones se guardan en la carpeta `Migrations/` y **se versionan en Git con el resto del código**. Así, el historial del esquema viaja con el proyecto: cualquiera que clone el repositorio puede reconstruir la base de datos exacta con un solo comando.
:::

El ciclo de trabajo, que repetirás en los pasos 9 y 11, es siempre el mismo:

```
1. Cambias las entidades o su configuración (C#)
2. Add-Migration NombreDescriptivo   → EF Core compara tu modelo con el último que conoce
                                       y genera una migración con las diferencias
3. Revisas el código generado        → ¿hace lo que esperas?
4. Update-Database                   → aplica las migraciones pendientes a la base de datos
```

## Dos formas de ejecutar los comandos

| Herramienta | Dónde se usa | Ejemplo |
| --- | --- | --- |
| **Package Manager Console** (PMC) | Dentro de Visual Studio. La aporta el paquete `Microsoft.EntityFrameworkCore.Tools` que instalaste en el paso 5. | `Add-Migration InitialCreate` |
| **CLI `dotnet ef`** | Cualquier terminal, en cualquier sistema operativo. Hay que instalarla aparte. | `dotnet ef migrations add InitialCreate` |

Las dos hacen exactamente lo mismo. En este tutorial usaremos la **PMC**, que es la que la documentación de EF Core recomienda si trabajas en Visual Studio: trabaja con el proyecto seleccionado sin cambiar de carpeta, abre los archivos generados y autocompleta nombres con <kbd>Tab</kbd>. Junto a cada comando verás su equivalente en la CLI.

:::tip Instalar la CLI dotnet ef (opcional)
Si quieres usar la CLI, instálala una vez como herramienta global, con la misma versión que tus paquetes:

```powershell
dotnet tool install --global dotnet-ef --version 10.0.13
```

Ejecuta sus comandos desde la carpeta del proyecto (la que contiene `TaskTracker.Api.csproj`). La CLI necesita el paquete `Microsoft.EntityFrameworkCore.Design`, que ya tienes: llega como dependencia de `Microsoft.EntityFrameworkCore.Tools`.
:::

:::vs Abrir la Package Manager Console
1. Detén la API si se está ejecutando: los comandos de EF Core compilan el proyecto, y la compilación falla si el ejecutable está en uso.
2. Abre **Tools** > **NuGet Package Manager** > **Package Manager Console**. Se abre un panel en la parte inferior con el indicador `PM>`.
3. En el desplegable **Default project** de la parte superior del panel, comprueba que está seleccionado **`TaskTracker.Api`**. Con un solo proyecto en la solución será así, pero es la primera causa de errores cuando hay varios.
:::

## Crea la primera migración

En la Package Manager Console, escribe:

```powershell
Add-Migration InitialCreate
```

:::tip Equivalente en la CLI
```powershell
dotnet ef migrations add InitialCreate
```
:::

EF Core compila el proyecto, construye el modelo a partir de tu `DbContext` y genera la migración. Verás algo parecido a esto:

```
Build started...
Build succeeded.
To undo this action, use Remove-Migration.
```

(La CLI termina con `Done. To undo this action, use 'ef migrations remove'`.) Visual Studio abre el archivo de la migración, y en Solution Explorer aparece una carpeta nueva:

```
Migrations/
├── 20261020191523_InitialCreate.cs
├── 20261020191523_InitialCreate.Designer.cs
└── TaskTrackerDbContextModelSnapshot.cs
```

El número del principio es una **marca de tiempo** (año, mes, día, hora, minutos y segundos, en UTC): la tuya será distinta. Sirve para que las migraciones se ordenen cronológicamente.

:::why ¿Por qué el nombre InitialCreate?
El nombre de una migración es para personas: debe describir **qué cambia**, como un mensaje de commit. `InitialCreate` es la convención para la primera. Las siguientes se llamarán `AddTasks` y `AddTags`. Evita nombres como `Migration2` o `Fix`: dentro de seis meses no sabrás qué hacían.
:::

### Archivo 1: la migración

```csharp title="Migrations/20261020191523_InitialCreate.cs"
using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Projects",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Projects", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Projects");
        }
    }
}
```

**No tienes que escribirlo: lo generó EF Core.** Pero sí tienes que **leerlo** cada vez, porque es el código que modificará tu base de datos. Compáralo con lo que configuraste en el paso 6:

| En la migración | De dónde sale |
| --- | --- |
| `name: "Projects"` | De la propiedad `DbSet<Project> Projects` (convención). |
| `Id ... .Annotation("Sqlite:Autoincrement", true)` y `table.PrimaryKey("PK_Projects", ...)` | La propiedad `Id` es la clave primaria y la genera la base de datos (convención). |
| `Name ... maxLength: 100, nullable: false` | `nullable: false` por ser `string` sin `?` (convención); `maxLength: 100` por tu `HasMaxLength(100)` (Fluent API). |
| `Description ... maxLength: 500, nullable: true` | `string?` (convención) y `HasMaxLength(500)` (Fluent API). |
| `CreatedAt ... type: "TEXT"` | SQLite no tiene tipo de fecha: un `DateTime` se guarda como texto. |
| `Down` → `DropTable` | Lo contrario de `Up`, para poder deshacer la migración. |

Fíjate en que todos los tipos son `INTEGER` o `TEXT`: el proveedor de SQLite ha traducido tus tipos de C# a los pocos tipos que SQLite entiende.

:::tip #nullable disable y partial
`#nullable disable` desactiva las advertencias de *nullable* en este archivo, porque es código generado. `partial` significa que la clase `InitialCreate` está repartida en dos archivos: este y el `.Designer.cs`.
:::

### Archivo 2: el Designer

`20261020191523_InitialCreate.Designer.cs` es la otra mitad de la clase `InitialCreate`. Contiene los atributos `[DbContext(typeof(TaskTrackerDbContext))]` y `[Migration("20261020191523_InitialCreate")]`, que identifican la migración, y una **foto del modelo completo** tal como era en el momento de crearla (método `BuildTargetModel`). EF Core la usa internamente; no la edites nunca.

### Archivo 3: el snapshot

```csharp title="Migrations/TaskTrackerDbContextModelSnapshot.cs (fragmento)"
[DbContext(typeof(TaskTrackerDbContext))]
partial class TaskTrackerDbContextModelSnapshot : ModelSnapshot
{
    protected override void BuildModel(ModelBuilder modelBuilder)
    {
#pragma warning disable 612, 618
        modelBuilder.HasAnnotation("ProductVersion", "10.0.13");

        modelBuilder.Entity("TaskTracker.Api.Entities.Project", b =>
            {
                b.Property<int>("Id")
                    .ValueGeneratedOnAdd()
                    .HasColumnType("INTEGER");

                // ... CreatedAt, Description and Name ...

                b.HasKey("Id");

                b.ToTable("Projects");
            });
#pragma warning restore 612, 618
    }
}
```

:::concept Model snapshot
El **snapshot** es la foto del modelo **más reciente** que conocen tus migraciones. Cuando ejecutes `Add-Migration AddTasks` en el paso 9, EF Core **no mira la base de datos**: compara tu modelo actual (las clases) con este snapshot, y la diferencia es lo que escribe en la nueva migración. Después, actualiza el snapshot.

Por eso hay dos reglas que no debes romper:

- **No edites el snapshot a mano.**
- **No borres archivos de migración a mano**: usa `Remove-Migration`, que también restaura el snapshot.
:::

## Deshacer una migración que no has aplicado

Imagina que, al revisar la migración, descubres un error en tu modelo: te faltó una configuración, o el nombre no es el adecuado. Mientras la migración **no se haya aplicado** a ninguna base de datos, deshacerla es seguro.

Pruébalo ahora. En la Package Manager Console:

```powershell
Remove-Migration
```

:::tip Equivalente en la CLI
```powershell
dotnet ef migrations remove
```
:::

La salida es parecida a esta:

```
Build started...
Build succeeded.
Removing migration '20261020191523_InitialCreate'.
Removing model snapshot.
Done.
```

`Remove-Migration` borra **la última** migración y deja el snapshot como estaba antes de ella. Como era la única, el snapshot desaparece también y la carpeta `Migrations` queda vacía. Vuelve a crearla:

```powershell
Add-Migration InitialCreate
```

Obtienes los mismos tres archivos, con una marca de tiempo nueva. A partir de aquí, usa siempre **tu** marca de tiempo cuando la veas en el tutorial.

:::warning Remove-Migration solo para migraciones no aplicadas
Si la migración ya se aplicó a tu base de datos, `Remove-Migration` se niega:

```
The migration '20261020191523_InitialCreate' has already been applied to the database. Revert it and try again. If the migration has been applied to other databases, consider reverting its changes using a new migration instead.
```

Y si ya la compartiste (la subiste a Git y otros la aplicaron), **no la borres**: crea una migración nueva que corrija el cambio. Las migraciones publicadas son historia, igual que los commits publicados.
:::

## Mira el SQL antes de ejecutarlo

Antes de tocar la base de datos, puedes pedirle a EF Core el SQL exacto que va a ejecutar:

```powershell
Script-Migration
```

:::tip Equivalente en la CLI
```powershell
dotnet ef migrations script
```
:::

En la PMC, el script se abre en una pestaña nueva del editor como un archivo `.sql`; la CLI lo imprime en la consola. Su contenido es este (con tu marca de tiempo):

```sql
CREATE TABLE IF NOT EXISTS "__EFMigrationsHistory" (
    "MigrationId" TEXT NOT NULL CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY,
    "ProductVersion" TEXT NOT NULL
);

BEGIN TRANSACTION;
CREATE TABLE "Projects" (
    "Id" INTEGER NOT NULL CONSTRAINT "PK_Projects" PRIMARY KEY AUTOINCREMENT,
    "Name" TEXT NOT NULL,
    "Description" TEXT NULL,
    "CreatedAt" TEXT NOT NULL
);

INSERT INTO "__EFMigrationsHistory" ("MigrationId", "ProductVersion")
VALUES ('20261020191523_InitialCreate', '10.0.13');

COMMIT;
```

Tres observaciones importantes:

1. **`__EFMigrationsHistory`**: una tabla que EF Core crea para anotar **qué migraciones se han aplicado** a esta base de datos. Es así como `Update-Database` sabe cuáles le faltan.
2. **La migración va dentro de una transacción** y termina insertando su propio nombre en el historial. O se aplica entera, o no se aplica.
3. **`"Name" TEXT NOT NULL`, sin longitud**: aquí tienes, por escrito, la limitación que te adelantamos en el paso 6. El `maxLength: 100` de la migración no llega al SQL de SQLite.

:::why ¿Para qué sirve Script-Migration en la vida real?
En producción no se suele ejecutar `Update-Database` desde el equipo de un desarrollador. Lo habitual es generar el script SQL, revisarlo (a veces lo revisa un administrador de bases de datos) y aplicarlo en el proceso de despliegue. Acostúmbrate a mirarlo: es la mejor forma de saber qué está haciendo EF Core por ti.
:::

## Crea la base de datos

Ahora sí. En la Package Manager Console:

```powershell
Update-Database
```

:::tip Equivalente en la CLI
```powershell
dotnet ef database update
```
:::

La salida es larga, porque EF Core registra cada sentencia SQL que ejecuta. Lo importante está en estas líneas (resumidas):

```
Build started...
Build succeeded.
Acquiring an exclusive lock for migration application. See https://aka.ms/efcore-docs-migrations-lock for more information if this takes too long.
Applying migration '20261020191523_InitialCreate'.
Done.
```

Entre ellas verás los `CREATE TABLE` e `INSERT` que leíste en el script. Y en la carpeta del proyecto ha aparecido un archivo nuevo: **`tasktracker.db`**. Esa es tu base de datos completa.

:::concept El bloqueo de migraciones
La línea `Acquiring an exclusive lock for migration application` es una protección que EF Core aplica desde la versión 9: si dos procesos intentan migrar la misma base de datos a la vez (por ejemplo, dos instancias de la API arrancando), solo uno lo hace. En SQLite lo implementa con una pequeña tabla auxiliar, `__EFMigrationsLock`, que verás dentro de la base de datos.
:::

Ejecuta `Update-Database` **una segunda vez**. Ahora la salida termina con:

```
No migrations were applied. The database is already up to date.
Done.
```

EF Core consultó `__EFMigrationsHistory`, vio que `InitialCreate` ya estaba aplicada y no hizo nada. Los comandos de migración son **idempotentes**: puedes ejecutarlos tantas veces como quieras.

## Mira dentro de la base de datos

`tasktracker.db` es un archivo binario: no se puede leer con el Bloc de notas. Necesitas un visor de SQLite.

:::warning SQL Server Object Explorer no abre archivos SQLite
Visual Studio incluye **SQL Server Object Explorer**, pero, como indica su nombre, trabaja con SQL Server, no con SQLite. Usa una de estas alternativas gratuitas:

- **DB Browser for SQLite** (sqlitebrowser.org): una aplicación de escritorio de código abierto. Es la opción más sencilla.
- La extensión **SQLite and SQL Server Compact Toolbox** para Visual Studio (desde **Extensions** > **Manage Extensions**). Comprueba que la versión publicada sea compatible con tu Visual Studio 2026 antes de instalarla.

Cualquiera de las dos sirve; las instrucciones siguientes son genéricas.
:::

:::vs Abrir la base de datos
1. Haz clic derecho sobre el proyecto `TaskTracker.Api` > **Open Folder in File Explorer** y localiza `tasktracker.db`.
2. Ábrelo con tu visor de SQLite (en DB Browser for SQLite: **Open Database** y elige el archivo).
3. Revisa la lista de tablas y su estructura.
4. **Cierra el archivo en el visor** cuando termines: SQLite bloquea el archivo mientras otro programa lo tiene abierto para escribir.
:::

Encontrarás cuatro tablas:

| Tabla | Qué es |
| --- | --- |
| `Projects` | **Tu** tabla, vacía, con las columnas `Id`, `Name`, `Description` y `CreatedAt`. |
| `__EFMigrationsHistory` | Una fila: `MigrationId` = tu `..._InitialCreate` y `ProductVersion` = `10.0.13`. |
| `__EFMigrationsLock` | La tabla auxiliar del bloqueo de migraciones. Vacía. |
| `sqlite_sequence` | Interna de SQLite: guarda el último valor usado por cada columna `AUTOINCREMENT`. |

:::tip También desde la consola
`Get-Migration` (en la CLI, `dotnet ef migrations list`) lista las migraciones y, si se puede conectar a la base de datos, indica cuáles están pendientes. Antes de `Update-Database` verías `20261020191523_InitialCreate (Pending)`; ahora aparece sin la marca `(Pending)`.
:::

## La base de datos no se sube a Git

Las **migraciones sí** se versionan: son código y documentan la evolución del esquema. El **archivo `tasktracker.db` no**: contiene datos locales de tu máquina y se puede reconstruir en cualquier momento con `Update-Database`. Además, SQLite puede crear junto a él archivos temporales (`tasktracker.db-shm` y `tasktracker.db-wal`) que tampoco deben compartirse.

:::vs Crear el archivo .gitignore del proyecto
1. Haz clic derecho sobre el proyecto `TaskTracker.Api` > **Add** > **New Item…**
2. En el cuadro de búsqueda escribe `Text File`, elige la plantilla **Text File** y, como nombre, escribe **`.gitignore`** (con el punto inicial y sin extensión). Pulsa **Add**.
3. Pega el contenido siguiente y guarda.
:::

```gitignore title=".gitignore"
# Local SQLite database (recreated by migrations)
*.db
*.db-shm
*.db-wal
```

Es un `.gitignore` **del proyecto**: se aplica a la carpeta `TaskTracker.Api` y sus subcarpetas, y se suma a cualquier `.gitignore` que tengas en la raíz del repositorio (por ejemplo, el que ignora `bin/` y `obj/`).

:::tip Si el nombre .gitignore te da problemas
Algunas versiones del Explorador de Windows no permiten crear archivos que empiezan por punto, pero Visual Studio sí. Si la plantilla te añade `.txt` al final, renómbralo en Solution Explorer (<kbd>F2</kbd>) a `.gitignore`.
:::

## Las migraciones y las limitaciones de SQLite

En el paso 5 viste que SQLite tiene un `ALTER TABLE` muy limitado: puede **añadir** columnas, pero no cambiar el tipo de una existente ni, en general, modificarla. Cuando una migración necesita una de esas operaciones, el proveedor de SQLite de EF Core la resuelve **reconstruyendo la tabla**: crea una tabla nueva con el esquema correcto, copia los datos y borra la antigua.

Funciona, pero es más delicado y, con muchos datos, más lento. Por eso, en este tutorial, todas las migraciones serán **aditivas**: `AddTasks` y `AddTags` solo añadirán tablas, columnas, claves foráneas e índices. Si algún día necesitas eliminar o modificar columnas en SQLite, lee antes la página de limitaciones del proveedor en la documentación de EF Core.

:::checkpoint La base de datos existe
**1. La migración está aplicada.** En la Package Manager Console:

```powershell
Get-Migration
```

Debe listar tu migración `..._InitialCreate` **sin** la marca `(Pending)`. (CLI: `dotnet ef migrations list`.)

**2. El archivo existe.** En la carpeta del proyecto está `tasktracker.db`. En tu visor de SQLite, la tabla `__EFMigrationsHistory` tiene una fila con tu `..._InitialCreate` y `10.0.13`, y la tabla `Projects` tiene las columnas `Id` (`INTEGER`), `Name` (`TEXT`, no nula), `Description` (`TEXT`, nula) y `CreatedAt` (`TEXT`, no nula).

**3. Repetir no rompe nada.** Un segundo `Update-Database` termina con `No migrations were applied. The database is already up to date.`

**4. La API sigue funcionando, todavía en memoria.** Cierra el visor de SQLite, ejecuta la API y envía el `POST /api/projects` del `.http` → `201 Created`. Después abre otra vez `tasktracker.db`: la tabla `Projects` sigue **vacía**. Es lo esperado: los endpoints todavía usan `InMemoryProjectStore`. Los conectarás a la base de datos en el siguiente paso.

**5. Compilación limpia.** **Build** > **Rebuild Solution** sin errores ni advertencias.
:::

:::troubleshooting Errores comunes
- **`The term 'Add-Migration' is not recognized as the name of a cmdlet...`:** falta el paquete `Microsoft.EntityFrameworkCore.Tools` (paso 5), o Visual Studio no ha recargado la consola. Instálalo y, si persiste, reinicia Visual Studio.
- **`Build failed.`** al ejecutar un comando: los comandos compilan primero. Abre **View** > **Error List**. Si el error dice que el archivo `.exe` está **en uso** por otro proceso, la API se está ejecutando: detenla.
- **`No DbContext was found in assembly 'TaskTracker.Api'`:** el **Default project** de la consola no es `TaskTracker.Api`, o la clase no hereda de `DbContext`.
- **`Your startup project '...' doesn't reference Microsoft.EntityFrameworkCore.Design`:** el proyecto de inicio de la solución no es `TaskTracker.Api`. Haz clic derecho sobre él > **Set as Startup Project**.
- **CLI: `No project was found. Change the current working directory or use the --project option.`** Estás en la carpeta de la solución, no en la del proyecto. Entra en `TaskTracker.Api` o añade `--project TaskTracker.Api`.
- **CLI: `Unable to retrieve project metadata. Ensure it's an SDK-style project.`** El proyecto no se ha restaurado o compilado todavía, o la versión de `dotnet-ef` no coincide con la de los paquetes. Ejecuta `dotnet build` en la carpeta del proyecto y vuelve a intentarlo; si persiste, instala `dotnet-ef` en la versión `10.0.13`.
- **`Update-Database` dice `Done.` pero no aparece `tasktracker.db`:** la cadena de conexión llega vacía. Revisa que `GetConnectionString("TaskTracker")` y la clave de `appsettings.json` coincidan exactamente (paso 6).
- **`SQLite Error 5: 'database is locked'`:** otro programa tiene la base de datos abierta, normalmente tu visor de SQLite. Ciérralo y repite el comando.
- **`The migration '...' has already been applied to the database. Revert it and try again...`:** intentaste `Remove-Migration` después de `Update-Database`. En este punto del tutorial no hace falta: deja la migración como está.
:::

:::recap
- Una **migración** describe cómo cambiar el esquema de la base de datos (`Up`) y cómo deshacerlo (`Down`). Se genera con `Add-Migration` y se versiona en Git.
- El **snapshot** es la foto más reciente del modelo; `Add-Migration` compara tus clases con él, no con la base de datos. No se edita a mano.
- `Remove-Migration` deshace la última migración **no aplicada**; `Script-Migration` muestra el SQL; `Update-Database` aplica las pendientes y crea la base de datos si no existe.
- **`__EFMigrationsHistory`** registra qué migraciones tiene aplicadas cada base de datos; por eso los comandos son idempotentes.
- La CLI `dotnet ef` ofrece los mismos comandos: `migrations add`, `migrations remove`, `migrations script`, `database update`, `migrations list`.
- `tasktracker.db` no se sube a Git (`.gitignore`); las migraciones sí. En SQLite, este tutorial solo usa migraciones **aditivas**.

En el siguiente paso cambiarás el almacén en memoria por el `DbContext`: tus endpoints leerán y escribirán en `tasktracker.db`, y los datos sobrevivirán a los reinicios.
:::
