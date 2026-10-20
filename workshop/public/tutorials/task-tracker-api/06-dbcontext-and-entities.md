## Objetivo del paso

Con los paquetes instalados, toca presentarle a EF Core tu modelo. En este paso vas a:

1. Crear **`TaskTrackerDbContext`**, la clase central de EF Core, con un `DbSet<Project>`.
2. Entender qué deduce EF Core **solo**, por **convenciones**, a partir de la clase `Project`.
3. Completar lo que las convenciones no pueden saber con la **Fluent API**, en una clase de configuración aparte.
4. Guardar la **cadena de conexión** en `appsettings.json`.
5. Registrar el `DbContext` en el contenedor de DI con `AddDbContext` y entender por qué su tiempo de vida es **scoped**.

Al terminar, EF Core conocerá tu modelo, pero **la base de datos todavía no existirá** y los endpoints seguirán usando el almacén en memoria. Crearás la base de datos en el paso 7 y conectarás los endpoints en el paso 8.

## El DbContext

:::concept DbContext
`DbContext` es la clase de EF Core que representa una **sesión de trabajo** con la base de datos. A través de ella:

- **Consultas** datos, con LINQ sobre sus `DbSet<T>`.
- **Registras cambios**: las entidades que cargas quedan "vigiladas" por el *change tracker*.
- **Guardas**: `SaveChanges()` convierte todos los cambios pendientes en `INSERT`, `UPDATE` y `DELETE`, dentro de una **transacción**.

Nunca usas `DbContext` directamente: creas **tu propia clase** que hereda de él y declara un `DbSet<T>` por cada entidad. Ese es tu "mapa" de la base de datos.
:::

:::vs Crear TaskTrackerDbContext.cs
1. En Solution Explorer, haz clic derecho sobre la carpeta **`Data`** (la creaste en el paso 4) > **Add** > **Class…**
2. Nómbrala **`TaskTrackerDbContext.cs`** y pulsa **Add**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Data/TaskTrackerDbContext.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data;

public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
{
    public DbSet<Project> Projects => Set<Project>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        // Picks up every IEntityTypeConfiguration<T> in this project (Data/Configurations).
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(TaskTrackerDbContext).Assembly);
    }
}
```

### Explicación línea a línea

**La declaración de la clase:**

```csharp
public class TaskTrackerDbContext(DbContextOptions<TaskTrackerDbContext> options) : DbContext(options)
```

- `(DbContextOptions<TaskTrackerDbContext> options)` justo después del nombre es un **constructor primario** (C# 12): declara un parámetro del constructor sin escribir el constructor completo.
- `: DbContext(options)` pasa esas opciones al constructor de la clase base.
- Las **opciones** dicen qué proveedor usar (SQLite) y con qué cadena de conexión. El `DbContext` no decide nada de eso: lo recibe desde fuera, por inyección de dependencias. Lo configurarás en `Program.cs` dentro de un momento.

**El `DbSet`:**

```csharp
public DbSet<Project> Projects => Set<Project>();
```

| Parte | Qué significa |
| --- | --- |
| `DbSet<Project>` | Representa la tabla de proyectos. Es el punto de partida de cualquier consulta: `db.Projects.Where(...)`, `db.Projects.Add(...)`. |
| `Projects` | El nombre de la propiedad. Por convención, **la tabla se llamará igual**: `Projects`. |
| `=> Set<Project>()` | Una propiedad de solo lectura que devuelve el `DbSet` que EF Core ya gestiona internamente. Evita la advertencia de *nullable* que tendrías con `{ get; set; }`, sin tener que escribir `= null!`. |

**`OnModelCreating`:**

EF Core llama a este método **una vez**, la primera vez que necesita el modelo, para que puedas configurarlo. Aquí solo hay una línea: `ApplyConfigurationsFromAssembly` busca en tu proyecto todas las clases que implementen `IEntityTypeConfiguration<T>` y las aplica. Así, cada entidad tendrá su configuración en su propio archivo y no tendrás que volver a tocar el `DbContext` para registrarlas.

## Convenciones: lo que EF Core deduce solo

Antes de configurar nada, mira qué sabe ya EF Core de `Project` sin que se lo digas:

```csharp
public class Project
{
    public int Id { get; set; }
    public required string Name { get; set; }
    public string? Description { get; set; }
    public DateTime CreatedAt { get; set; }
}
```

:::concept Convenciones de EF Core
Las **convenciones** son reglas que EF Core aplica automáticamente al construir el modelo. Cubren la mayoría de los casos, de modo que solo configuras las excepciones.

| En la clase | Convención | En SQLite |
| --- | --- | --- |
| `DbSet<Project> Projects` | La tabla toma el nombre de la propiedad `DbSet`. | Tabla `Projects` |
| `int Id` | Una propiedad llamada `Id` (o `ProjectId`) es la **clave primaria**. Si es entera, la genera la base de datos. | `INTEGER ... PRIMARY KEY AUTOINCREMENT` |
| `string Name` (sin `?`) | Con *nullable* activado, un tipo no anulable es **obligatorio**. | `TEXT NOT NULL` |
| `string? Description` | Un tipo anulable es **opcional**. | `TEXT NULL` |
| `DateTime CreatedAt` | Cada propiedad pública con `get` y `set` es una columna. SQLite no tiene tipo de fecha. | `TEXT NOT NULL` |
:::

Lo que las convenciones **no** pueden adivinar son tus reglas de negocio: ¿cuántos caracteres puede tener un nombre? Para eso está la configuración.

## Tres formas de configurar el modelo

| Forma | Ejemplo | Ventajas | Inconvenientes |
| --- | --- | --- | --- |
| **Convenciones** | (nada) | Cero código. | Solo cubren lo genérico. |
| **Data annotations** (atributos en la entidad) | `[MaxLength(100)] public required string Name` | Rápido y visible al leer la clase. | Mezcla detalles de la base de datos con la entidad, y no todo se puede expresar con atributos. |
| **Fluent API** (código en el `DbContext` o en clases de configuración) | `builder.Property(p => p.Name).HasMaxLength(100);` | Puede expresarlo **todo** (índices, relaciones, conversiones…) y deja la entidad limpia. | Un archivo más por entidad. |

:::why ¿Por qué Fluent API en clases separadas?
En este tutorial seguiremos una regla sencilla: **todo lo que es de la base de datos vive en `Data/`**. La entidad `Project` describe qué es un proyecto; cuánto mide una columna o qué índice tiene es un detalle de almacenamiento. Con la Fluent API la entidad no sabe nada de EF Core, y con una clase `IEntityTypeConfiguration<T>` por entidad, el `DbContext` no crece aunque añadas tareas y etiquetas (pasos 9 y 11). Además, hay cosas que solo la Fluent API puede expresar, como las conversiones de tipos o los índices compuestos, y así todo queda en el mismo sitio.
:::

## La configuración de Project

:::vs Crear ProjectConfiguration.cs
1. Clic derecho sobre la carpeta **`Data`** > **Add** > **New Folder** y nómbrala **`Configurations`**.
2. Clic derecho sobre `Configurations` > **Add** > **Class…**, nómbrala **`ProjectConfiguration.cs`** y pulsa **Add**.
3. Reemplaza el contenido por el código siguiente.
:::

```csharp title="Data/Configurations/ProjectConfiguration.cs"
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TaskTracker.Api.Entities;

namespace TaskTracker.Api.Data.Configurations;

public class ProjectConfiguration : IEntityTypeConfiguration<Project>
{
    public void Configure(EntityTypeBuilder<Project> builder)
    {
        builder.Property(p => p.Name)
            .HasMaxLength(100);

        builder.Property(p => p.Description)
            .HasMaxLength(500);
    }
}
```

| Elemento | Qué significa |
| --- | --- |
| `IEntityTypeConfiguration<Project>` | La interfaz que encuentra `ApplyConfigurationsFromAssembly`. Tiene un único método, `Configure`. |
| `EntityTypeBuilder<Project> builder` | El objeto con el que describes la entidad. Cada llamada es *fluida*: devuelve un *builder* sobre el que puedes seguir encadenando. |
| `builder.Property(p => p.Name)` | Selecciona la propiedad con una lambda: si renombras `Name`, el compilador te avisa. Nada de cadenas de texto. |
| `.HasMaxLength(100)` | Longitud máxima de 100 caracteres. |

Fíjate en lo que **no** configuramos: ni la clave primaria, ni que `Name` sea obligatorio, ni el nombre de la tabla. Las convenciones ya lo resolvieron. Configura solo lo que las convenciones no saben.

:::warning SQLite no hará cumplir HasMaxLength
En SQL Server, `HasMaxLength(100)` crearía una columna `nvarchar(100)` que rechaza textos más largos. **SQLite ignora las longitudes**: la columna será un `TEXT` sin límite. ¿Sirve entonces para algo? Sí: documenta la regla en el modelo, la verás reflejada en la migración del paso 7, y otros proveedores sí la aplican. En el paso 12 comprobarás que SQLite guarda un nombre de 150 caracteres sin protestar, y lo resolverás con validación en la API.
:::

## La cadena de conexión

:::concept Cadena de conexión
Una **cadena de conexión** (*connection string*) le dice al proveedor **dónde** está la base de datos y cómo conectarse. Para SQLite es muy corta: `Data Source=tasktracker.db` significa "usa el archivo `tasktracker.db`; si no existe, créalo". En SQL Server incluiría servidor, base de datos y credenciales.
:::

No la escribiremos en el código: la pondremos en la **configuración**, como aprendiste en el tutorial 1 (paso 10). Así podrías usar otro archivo, u otra base de datos, en cada entorno sin recompilar.

:::vs Editar appsettings.json
1. En Solution Explorer, abre **`appsettings.json`** (no `appsettings.Development.json`).
2. Añade la sección `ConnectionStrings` al principio, como en el código siguiente. Cuidado con la **coma** después de la llave de cierre de la sección.
:::

```json title="appsettings.json"
{
  "ConnectionStrings": {
    "TaskTracker": "Data Source=tasktracker.db"
  },
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "AllowedHosts": "*"
}
```

- `ConnectionStrings` es una sección con un nombre **especial**: ASP.NET Core ofrece un atajo para leerla, `builder.Configuration.GetConnectionString("TaskTracker")`, equivalente a leer la clave `ConnectionStrings:TaskTracker`.
- `tasktracker.db` es una **ruta relativa**: se resuelve desde el directorio de trabajo de la aplicación. Cuando ejecutas desde Visual Studio, y con los comandos de EF Core del paso 7, es la carpeta del proyecto (`TaskTracker.Api`), y ahí aparecerá el archivo.

## Registra el DbContext

El último paso es contarle al contenedor de DI cómo crear un `TaskTrackerDbContext`.

:::vs Editar Program.cs
1. Abre `Program.cs`.
2. Añade `using Microsoft.EntityFrameworkCore;` como **primera** línea.
3. Añade el bloque `AddDbContext` en la sección `// --- Services ---`, después del registro del almacén. El archivo completo queda así:
:::

```csharp title="Program.cs"
using Microsoft.EntityFrameworkCore;
using TaskTracker.Api.Data;
using TaskTracker.Api.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddOpenApi();
builder.Services.AddProblemDetails();

builder.Services.AddSingleton<InMemoryProjectStore>();

builder.Services.AddDbContext<TaskTrackerDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("TaskTracker")));

var app = builder.Build();

// --- Development-only setup ---
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

// --- Middleware pipeline ---
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseHttpsRedirection();

// --- Endpoints ---
app.MapProjectEndpoints();

app.Run();
```

| Fragmento | Qué hace |
| --- | --- |
| `using Microsoft.EntityFrameworkCore;` | Trae los métodos de extensión de EF Core, entre ellos `UseSqlite`. |
| `AddDbContext<TaskTrackerDbContext>(...)` | Registra tu `DbContext` en el contenedor de DI, con tiempo de vida **scoped**. |
| `options => options.UseSqlite(...)` | Configura las opciones que recibirá el constructor de `TaskTrackerDbContext`: proveedor SQLite y la cadena de conexión leída de `appsettings.json`. |

:::concept ¿Por qué scoped?
`AddDbContext` registra el contexto como **scoped**: **una instancia por petición HTTP**, que se descarta al terminar la respuesta. Recuerda los tiempos de vida del tutorial 1 (paso 8): es el término medio perfecto para un `DbContext`, por tres razones:

- **No es seguro entre hilos.** Un `DbContext` no admite dos operaciones a la vez. Si fuera singleton, dos peticiones simultáneas lo usarían al mismo tiempo y fallarían.
- **Representa una unidad de trabajo.** Vigila las entidades que cargas para saber qué guardar. Si viviera para siempre, acumularía entidades de todas las peticiones, y la memoria crecería sin parar.
- **Es barato de crear.** Crear uno por petición no tiene un coste apreciable; las conexiones se reutilizan por debajo.
:::

:::warning Nunca inyectes el DbContext en un singleton
Es la **dependencia cautiva** que provocaste a propósito en el tutorial 1: un servicio singleton que recibe un `DbContext` lo retendría para siempre, con los tres problemas de arriba. En `Development`, ASP.NET Core valida los tiempos de vida al arrancar y lo detectaría con un error del tipo `Cannot consume scoped service 'TaskTracker.Api.Data.TaskTrackerDbContext' from singleton ...`. Por eso **no** cambiaremos `InMemoryProjectStore` para que use EF Core: en el paso 8 los handlers pedirán el `DbContext` directamente, y el almacén desaparecerá.
:::

### Una situación transitoria

Fíjate en que ahora `Program.cs` registra **dos** fuentes de datos: el almacén en memoria, que usan los endpoints, y el `DbContext`, que todavía no usa nadie. Es intencional: así cada paso cambia una sola cosa. Este es el estado actual:

| Pieza | Estado |
| --- | --- |
| Endpoints | Funcionan con `InMemoryProjectStore`, igual que en el paso 4. |
| `TaskTrackerDbContext` | Registrado y configurado. Nadie lo pide todavía. |
| Base de datos `tasktracker.db` | **No existe.** Registrar el contexto no crea nada; la crearás con una migración en el paso 7. |

:::checkpoint EF Core conoce tu modelo
**1. Compila.** **Build** > **Rebuild Solution** sin errores ni advertencias.

**2. EF Core encuentra tu contexto.** En la **Package Manager Console** (**Tools** > **NuGet Package Manager** > **Package Manager Console**), comprueba que el desplegable **Default project** muestra `TaskTracker.Api` y ejecuta:

```powershell
Get-DbContext
```

La consola compila el proyecto (`Build started...`, `Build succeeded.`) y lista los `DbContext` que encuentra. Debe aparecer **`TaskTrackerDbContext`** (según la versión de las herramientas, con su espacio de nombres completo, `TaskTracker.Api.Data.TaskTrackerDbContext`).

Para ver más detalle (proveedor y archivo de datos), puedes usar la CLI `dotnet ef`, que instalarás en el paso 7: `dotnet ef dbcontext info` muestra, entre otras líneas, `Provider name: Microsoft.EntityFrameworkCore.Sqlite` y `Data source: tasktracker.db`.

**3. La API sigue funcionando en memoria.** Ejecuta la API y envía:

- `POST /api/projects` → `201 Created`.
- `GET /api/projects` → `200 OK` con el proyecto creado.

**4. No hay base de datos.** Haz clic derecho sobre el proyecto > **Open Folder in File Explorer** (*Abrir carpeta en el Explorador de archivos*): en la carpeta del proyecto **no** hay ningún `tasktracker.db`. Todavía.
:::

:::troubleshooting Errores comunes
- **`CS1061: 'DbContextOptionsBuilder' does not contain a definition for 'UseSqlite'...`:** falta `using Microsoft.EntityFrameworkCore;` en `Program.cs`, o no está instalado el paquete `Microsoft.EntityFrameworkCore.Sqlite` (paso 5).
- **`CS0246: The type or namespace name 'IEntityTypeConfiguration<>' could not be found`** (o `EntityTypeBuilder<>`): faltan los `using` de `Microsoft.EntityFrameworkCore` y `Microsoft.EntityFrameworkCore.Metadata.Builders` en `ProjectConfiguration.cs`.
- **`CS7036: There is no argument given that corresponds to the required parameter 'options'...`:** la clase base no recibe las opciones. Revisa que la declaración termine en `: DbContext(options)`.
- **`Get-DbContext` dice `No DbContext was found in assembly 'TaskTracker.Api'`:** el **Default project** de la consola no es `TaskTracker.Api`, o la clase no hereda de `DbContext`.
- **`Get-DbContext` falla con `Build failed.`:** la consola compila antes de ejecutar cada comando. Abre **View** > **Error List** y corrige los errores de compilación primero.
- **La cadena de conexión no se lee** (en el paso 7, `dotnet ef dbcontext info` muestra `Data source:` vacío): el nombre en `GetConnectionString("TaskTracker")` no coincide **exactamente** con la clave de `appsettings.json`, o la sección no se llama `ConnectionStrings`. Es un error silencioso: con una cadena vacía, SQLite usa una base de datos temporal y los comandos parecen funcionar sin crear ningún archivo.
- **`appsettings.json` marca un error de sintaxis:** casi siempre es una coma: debe haber una después de la llave que cierra `ConnectionStrings` y ninguna después del último elemento.
:::

:::recap
- **`TaskTrackerDbContext`** hereda de `DbContext`, recibe sus opciones por constructor y expone `DbSet<Project> Projects`.
- Las **convenciones** deducen la tabla, la clave primaria y qué columnas son obligatorias; tú solo configuras lo demás.
- La **Fluent API**, en clases `IEntityTypeConfiguration<T>` dentro de `Data/Configurations`, mantiene las entidades limpias. `ApplyConfigurationsFromAssembly` las registra todas.
- `HasMaxLength` documenta la regla en el modelo, pero **SQLite no la hace cumplir**.
- La **cadena de conexión** vive en `appsettings.json` (`ConnectionStrings:TaskTracker`) y se lee con `GetConnectionString`.
- `AddDbContext` registra el contexto como **scoped**: uno por petición, nunca dentro de un singleton.

En el siguiente paso crearás la base de datos con tu primera **migración** y mirarás dentro del archivo `tasktracker.db`.
:::
