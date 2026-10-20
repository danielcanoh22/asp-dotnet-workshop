## Objetivo del paso

Hasta ahora los proyectos viven en memoria y desaparecen al reiniciar. En Bookshelf resolviste ese problema guardando un archivo JSON. Aquí daremos el salto a una **base de datos relacional**, y para hablar con ella usaremos un **ORM**: Entity Framework Core.

Este es un paso sobre todo de conceptos. Vas a:

1. Entender qué problema resuelve un ORM, viendo primero cómo sería **sin** él.
2. Conocer las piezas de **EF Core**: `DbContext`, `DbSet`, modelo, proveedor, *change tracker* y migraciones.
3. Saber qué es **SQLite** y por qué lo usamos, incluidas sus limitaciones.
4. Instalar los paquetes **`Microsoft.EntityFrameworkCore.Sqlite`** y **`Microsoft.EntityFrameworkCore.Tools`**.

Los endpoints no cambian en este paso: siguen usando el almacén en memoria.

## El problema: objetos en C#, tablas en la base de datos

Tu código trabaja con **objetos**: un `Project` con propiedades, listas, referencias. Una base de datos relacional trabaja con **tablas**: filas y columnas, relacionadas mediante claves. Son dos formas distintas de organizar los mismos datos, y alguien tiene que traducir entre ellas.

Sin ninguna ayuda, guardar y leer un proyecto con el driver de SQLite para .NET sería algo así:

```csharp
// Without an ORM: you write the SQL and copy every column by hand.
using var connection = new SqliteConnection("Data Source=tasktracker.db");
connection.Open();

var command = connection.CreateCommand();
command.CommandText = "SELECT Id, Name, Description, CreatedAt FROM Projects WHERE Id = $id";
command.Parameters.AddWithValue("$id", id);

using var reader = command.ExecuteReader();
if (reader.Read())
{
    var project = new Project
    {
        Id = reader.GetInt32(0),
        Name = reader.GetString(1),
        Description = reader.IsDBNull(2) ? null : reader.GetString(2),
        CreatedAt = reader.GetDateTime(3),
    };
}
```

Funciona, pero fíjate en lo que tienes que mantener a mano:

| Tarea manual | Riesgo |
| --- | --- |
| Escribir el SQL como texto | Una errata en un nombre de columna solo se descubre **al ejecutar**. |
| Copiar cada columna a cada propiedad, por posición | Añadir una columna obliga a revisar todas las consultas. |
| Gestionar `null`, tipos y conversiones | Un `GetString` sobre un `NULL` lanza una excepción. |
| Crear las tablas y cambiarlas cuando cambia el modelo | El esquema de la base de datos y tus clases se desincronizan sin que nadie lo note. |
| Saber qué objetos cambiaste para guardarlos | Tienes que escribir cada `UPDATE` tú mismo. |

Multiplica eso por cada consulta de la API y por cada tabla. Ese trabajo repetitivo es justo lo que automatiza un ORM.

## Qué es un ORM

:::concept ORM (Object-Relational Mapper)
Un **ORM** es una biblioteca que **traduce automáticamente** entre tus objetos y las tablas de una base de datos relacional. Tú describes la correspondencia una vez (qué clase va a qué tabla, qué propiedad a qué columna) y a partir de ahí trabajas con objetos y LINQ. El ORM genera el SQL, ejecuta las consultas y convierte las filas en objetos.

| En C# | En la base de datos |
| --- | --- |
| Una **clase** (`Project`) | Una **tabla** (`Projects`) |
| Una **propiedad** (`Name`) | Una **columna** (`Name`) |
| Un **objeto** | Una **fila** |
| Una **referencia** a otro objeto | Una **clave foránea** |
| Una consulta **LINQ** | Una sentencia **SQL** |
:::

Con un ORM, la consulta anterior se reduce a una línea:

```csharp
var project = await db.Projects.FindAsync(id);
```

:::why ¿Un ORM significa no saber SQL?
No. Un ORM te ahorra escribir el SQL **repetitivo**, no entenderlo. EF Core genera consultas muy buenas en la mayoría de los casos, pero si escribes un LINQ ineficiente, generará un SQL ineficiente. Por eso en este tutorial **leeremos el SQL** que genera EF Core (lo verás ya en el paso 7 y a fondo en el paso 14) y aprenderás a reconocer problemas como el **N+1**.
:::

## Entity Framework Core

**EF Core** es el ORM oficial de .NET, de código abierto y mantenido por Microsoft. Sus versiones van alineadas con las de .NET: con .NET 10 se usa **EF Core 10**.

Estas son sus piezas. No hace falta memorizarlas: las irás tocando una a una en los próximos pasos.

| Pieza | Qué es | Dónde la verás |
| --- | --- | --- |
| **Entidad** | Una clase que EF Core guarda en una tabla. Ya tienes una: `Project`. | Pasos 3, 9 y 11 |
| **`DbContext`** | La clase que representa una **sesión** con la base de datos: consultas, cambios pendientes y guardado. La tuya se llamará `TaskTrackerDbContext`. | Paso 6 |
| **`DbSet<T>`** | Una propiedad del `DbContext` por cada entidad (`DbSet<Project> Projects`). Es el punto de partida de las consultas LINQ sobre esa tabla. | Paso 6 |
| **Modelo** | La descripción completa que EF Core construye de tus entidades: tablas, columnas, claves, relaciones. Sale de **convenciones** y de tu **configuración**. | Paso 6 |
| **Proveedor** (*provider*) | El paquete que sabe hablar con un motor concreto (SQLite, SQL Server, PostgreSQL…) y genera **su** dialecto de SQL. | Este paso |
| **Change tracker** | El componente que recuerda qué entidades cargaste y detecta qué cambiaste, para generar los `INSERT`, `UPDATE` y `DELETE` al llamar a `SaveChanges()`. | Paso 8 |
| **Migraciones** | Archivos de C# que describen cómo pasar el esquema de la base de datos de una versión a la siguiente. | Paso 7 |

El viaje de una consulta:

```
Tu código LINQ ──▶ EF Core ──▶ Proveedor SQLite ──▶ SQL ──▶ tasktracker.db
db.Projects          (modelo,      (traduce al           │
  .Where(...)         change        dialecto de          │
                      tracker)      SQLite)              │
Objetos Project ◀── EF Core ◀── filas ◀─────────────────┘
```

Por ejemplo, este LINQ:

```csharp
var withoutDescription = await db.Projects
    .Where(p => p.Description == null)
    .OrderBy(p => p.Name)
    .ToListAsync();
```

se convierte en un SQL parecido a este, que se ejecuta **en la base de datos** (no en memoria):

```sql
SELECT "p"."Id", "p"."CreatedAt", "p"."Description", "p"."Name"
FROM "Projects" AS "p"
WHERE "p"."Description" IS NULL
ORDER BY "p"."Name"
```

:::concept Code-first frente a database-first
Hay dos formas de empezar con EF Core:

- **Code-first:** escribes primero las clases (entidades y `DbContext`) y EF Core **genera** la base de datos a partir de ellas, mediante migraciones. Tu código es la fuente de verdad.
- **Database-first:** la base de datos ya existe (por ejemplo, la de una aplicación antigua) y EF Core **genera las clases** leyéndola (*scaffolding*).

En este tutorial usamos **code-first**: la base de datos todavía no existe y queremos que su esquema evolucione junto con el código, versionado en Git.
:::

## Proveedores y SQLite

EF Core no sabe hablar con ninguna base de datos por sí solo: necesita un **proveedor**. Cambiar de motor consiste, sobre todo, en cambiar el paquete del proveedor y una línea de configuración.

| Proveedor (paquete NuGet) | Motor | Uso típico |
| --- | --- | --- |
| `Microsoft.EntityFrameworkCore.SqlServer` | SQL Server / Azure SQL | Aplicaciones empresariales en el ecosistema Microsoft. |
| `Npgsql.EntityFrameworkCore.PostgreSQL` | PostgreSQL | Muy popular en aplicaciones web y en la nube. |
| **`Microsoft.EntityFrameworkCore.Sqlite`** | **SQLite** | Aplicaciones de escritorio y móviles, prototipos, aprendizaje. **El de este tutorial.** |

:::concept SQLite
**SQLite** es un motor de base de datos relacional que guarda **toda la base de datos en un único archivo** (aquí, `tasktracker.db`). No hay un servidor que instalar ni que arrancar: la biblioteca de SQLite viaja dentro de tu aplicación y lee y escribe ese archivo directamente. Es probablemente la base de datos más usada del mundo: está dentro de navegadores, teléfonos y miles de aplicaciones.
:::

:::why ¿Por qué SQLite para aprender EF Core?
Porque elimina todo lo que no es EF Core: no instalas SQL Server, no configuras usuarios ni puertos, y si rompes algo, borras un archivo y vuelves a empezar. Todo lo que aprendas (DbContext, migraciones, LINQ, relaciones) funciona igual con SQL Server o PostgreSQL.
:::

Pero SQLite tiene limitaciones que conviene conocer **desde ya**, porque te las vas a encontrar:

| Limitación | Qué significa para ti | Dónde aparece |
| --- | --- | --- |
| Muy pocos tipos de columna (`INTEGER`, `REAL`, `TEXT`, `BLOB`) | Un `DateTime` se guarda como **texto**. Al leerlo, SQLite no recuerda que era UTC. | Pasos 7 y 8 |
| No impone longitudes máximas | Una columna `TEXT` acepta cualquier longitud aunque tu modelo diga "máximo 100". | Paso 12 |
| `ALTER TABLE` muy limitado | Las migraciones que **añaden** tablas o columnas funcionan bien; las que eliminan o modifican columnas requieren que EF Core reconstruya la tabla. En este tutorial solo haremos migraciones que añaden. | Pasos 7, 9 y 11 |
| Un solo escritor a la vez | Perfecto para una API de aprendizaje o de poco tráfico; no para miles de escrituras concurrentes. | — |

## Instala los paquetes de EF Core

Necesitas dos paquetes:

| Paquete | Para qué |
| --- | --- |
| `Microsoft.EntityFrameworkCore.Sqlite` | El **proveedor** de SQLite. Trae consigo, como dependencias, el propio EF Core (`Microsoft.EntityFrameworkCore`) y su parte relacional. Es lo que tu API usa **al ejecutarse**. |
| `Microsoft.EntityFrameworkCore.Tools` | Los comandos de EF Core para la **Package Manager Console** de Visual Studio (`Add-Migration`, `Update-Database`…). Solo se usa **mientras desarrollas**. |

:::warning Todas las versiones de EF Core deben coincidir
Usa la **misma versión** para todos los paquetes de EF Core, y que su número principal coincida con el de .NET: **10.x** para .NET 10. Mezclar `10.0.13` con otra versión distinta provoca advertencias de dependencias o errores difíciles de entender. En este tutorial usamos **10.0.13**. Si en NuGet aparece una 10.0.x más reciente, también sirve, siempre que instales la misma en los dos paquetes.
:::

:::vs Instalar los paquetes con el gestor de NuGet
1. Si la API se está ejecutando, detenla.
2. En Solution Explorer, haz clic derecho sobre el proyecto `TaskTracker.Api` > **Manage NuGet Packages…** (*Administrar paquetes NuGet*).
3. Abre la pestaña **Browse** (*Examinar*). Comprueba que la casilla **Include prerelease** (*Incluir versión preliminar*) está **desmarcada**: no queremos versiones preliminares de la siguiente versión de EF Core.
4. En el cuadro de búsqueda escribe `Microsoft.EntityFrameworkCore.Sqlite` y selecciona el paquete con ese nombre exacto (publicado por Microsoft).
5. En el panel de la derecha, en **Version**, elige **10.0.13** y pulsa **Install**.
6. Si aparece el cuadro **Preview Changes** (*Vista previa de cambios*), revisa la lista de dependencias y pulsa **Apply**. Si aparece **License Acceptance**, pulsa **I Accept**.
7. Repite los pasos 4 a 6 con **`Microsoft.EntityFrameworkCore.Tools`**, también en la versión **10.0.13**.
8. Comprueba el resultado: en Solution Explorer, **Dependencies** > **Packages** debe mostrar los dos paquetes nuevos junto a `Microsoft.AspNetCore.OpenApi`.
:::

:::tip Alternativas a la interfaz de NuGet
En la **Package Manager Console** (**Tools** > **NuGet Package Manager** > **Package Manager Console**):

```powershell
Install-Package Microsoft.EntityFrameworkCore.Sqlite -Version 10.0.13
Install-Package Microsoft.EntityFrameworkCore.Tools -Version 10.0.13
```

O con la CLI de .NET, desde la carpeta del proyecto:

```powershell
dotnet add package Microsoft.EntityFrameworkCore.Sqlite --version 10.0.13
dotnet add package Microsoft.EntityFrameworkCore.Tools --version 10.0.13
```

Los tres caminos producen el mismo `.csproj`.
:::

### Qué cambió en el .csproj

Haz doble clic sobre el proyecto `TaskTracker.Api` en Solution Explorer para abrir su archivo de proyecto. Debe quedar así:

```xml title="TaskTracker.Api.csproj"
<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.AspNetCore.OpenApi" Version="10.0.12" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Sqlite" Version="10.0.13" />
    <PackageReference Include="Microsoft.EntityFrameworkCore.Tools" Version="10.0.13">
      <IncludeAssets>runtime; build; native; contentfiles; analyzers; buildtransitive</IncludeAssets>
      <PrivateAssets>all</PrivateAssets>
    </PackageReference>
  </ItemGroup>

</Project>
```

| Elemento | Qué significa |
| --- | --- |
| `Microsoft.AspNetCore.OpenApi` | Venía con la plantilla. Su versión puede ser distinta en tu proyecto: depende de la versión de tu SDK. **No la cambies.** |
| `PackageReference ... Sqlite` | El proveedor, una referencia normal. |
| `<PrivateAssets>all</PrivateAssets>` en `Tools` | Marca el paquete como **herramienta de desarrollo**: no se propaga a otros proyectos que dependan de este. NuGet añade estas líneas solo, porque el paquete se declara a sí mismo como *development dependency*. |
| `<IncludeAssets>...</IncludeAssets>` | Qué partes del paquete se usan. Viene generado; no hace falta tocarlo. |

:::concept Un paquete trae otros
Abre **Dependencies** > **Packages** > **Microsoft.EntityFrameworkCore.Sqlite** en Solution Explorer: verás que depende de otros paquetes (por ejemplo, `Microsoft.EntityFrameworkCore.Sqlite.Core`, que a su vez trae `Microsoft.EntityFrameworkCore.Relational` y `Microsoft.EntityFrameworkCore`). Son **dependencias transitivas**: NuGet las instala automáticamente. Por eso basta con referenciar el proveedor para tener todo EF Core.
:::

:::checkpoint EF Core instalado
**1. Compila.** **Build** > **Rebuild Solution**: `1 succeeded, 0 failed` y la **Error List** sin errores ni advertencias.

**2. Los comandos de EF Core existen.** Abre **Tools** > **NuGet Package Manager** > **Package Manager Console** y ejecuta:

```powershell
Get-Help about_EntityFrameworkCore
```

Debe aparecer el logotipo de EF Core (un unicornio dibujado con caracteres) seguido de:

```
TOPIC
    about_EntityFrameworkCore

SHORT DESCRIPTION
    Provides information about the Entity Framework Core Package Manager Console Tools.
```

y, a continuación, la lista de comandos disponibles (`Add-Migration`, `Update-Database`…).

**3. (Alternativa por CLI)** En una terminal, en la carpeta del proyecto:

```powershell
dotnet list package
```

```
   [net10.0]:
   Top-level Package                           Requested   Resolved
   > Microsoft.AspNetCore.OpenApi              10.0.12     10.0.12
   > Microsoft.EntityFrameworkCore.Sqlite      10.0.13     10.0.13
   > Microsoft.EntityFrameworkCore.Tools       10.0.13     10.0.13
```

**4. La API sigue igual.** Ejecútala y envía `GET /api/projects` → `200 OK` con `[]`. Instalar paquetes no cambia el comportamiento: aún no los usamos.
:::

:::troubleshooting Errores comunes
- **`NU1202: Package Microsoft.EntityFrameworkCore.Sqlite 11.x is not compatible with net10.0`:** instalaste una versión para una versión de .NET más nueva (probablemente con **Include prerelease** marcado). Desinstálala y elige una **10.0.x**.
- **`NU1605: Detected package downgrade`** o advertencias sobre versiones en conflicto: los paquetes de EF Core tienen versiones distintas. Ponlos todos en la misma versión (en la pestaña **Installed** del gestor de NuGet, o editando el `.csproj`).
- **`Get-Help : Get-Help could not find about_EntityFrameworkCore`** o **`The term 'Add-Migration' is not recognized`:** el paquete `Tools` no está instalado, o la consola se abrió antes de instalarlo. Comprueba **Dependencies** > **Packages** y, si está, cierra y vuelve a abrir Visual Studio.
- **El gestor de NuGet no encuentra ningún paquete:** revisa tu conexión y que el **Package source** (arriba a la derecha) sea `nuget.org` o `All`.
- **`dotnet list package` dice que no encuentra un proyecto:** ejecútalo desde la carpeta que contiene `TaskTracker.Api.csproj`, no desde la de la solución, o pásale la ruta del proyecto.
:::

:::recap
- Un **ORM** traduce entre objetos y tablas: tú trabajas con clases y LINQ, y él genera y ejecuta el SQL.
- **EF Core** es el ORM de .NET. Sus piezas: entidades, `DbContext`, `DbSet<T>`, el modelo, el proveedor, el *change tracker* y las migraciones.
- Usaremos **code-first**: las clases son la fuente de verdad y la base de datos se genera a partir de ellas.
- **SQLite** guarda toda la base de datos en un archivo, sin servidor. Limitaciones: pocos tipos, sin longitudes máximas, `ALTER TABLE` limitado y un solo escritor.
- Instalaste `Microsoft.EntityFrameworkCore.Sqlite` (proveedor) y `Microsoft.EntityFrameworkCore.Tools` (comandos de la Package Manager Console), ambos en la versión **10.0.13**.

En el siguiente paso escribirás tu `DbContext`, configurarás la entidad `Project` y conectarás EF Core a la aplicación.
:::
