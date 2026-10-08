> Placeholder de demostración: este paso muestra todos los bloques que entiende el visor. El contenido real se escribe en otra tarea.

Este párrafo usa **negrita**, *cursiva*, `código en línea` y un [enlace](https://learn.microsoft.com/aspnet/core).

## Bloques de explicación

:::concept ¿Qué es un middleware?
Un **middleware** es un componente que procesa una petición HTTP y decide si la pasa al siguiente.

- Recibe el `HttpContext`.
- Puede actuar antes y después del siguiente componente.
:::

:::why ¿Por qué ASP.NET Core usa un pipeline?
Porque cada responsabilidad (autenticación, logging, errores) queda aislada y se puede componer en el orden que necesites.
:::

:::tip Atajo útil
Pulsa <kbd>Ctrl</kbd> + <kbd>F5</kbd> para ejecutar sin depurar.
:::

:::warning El orden importa
Registrar un middleware antes o después de otro cambia el comportamiento de tu API.
:::

:::vs Crear un proyecto nuevo
1. Abre **Visual Studio 2026**.
2. Elige **Crear un proyecto nuevo**.
3. Busca la plantilla **ASP.NET Core Web API**.
:::

## Código con nombre de archivo

```csharp title="Program.cs"
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var app = builder.Build();

app.MapControllers();
app.Run();
```

```json title="appsettings.json"
{
  "Logging": {
    "LogLevel": { "Default": "Information" }
  }
}
```

Y un bloque sin nombre de archivo:

```bash
dotnet run
```

```powershell
dotnet new webapi -n Bookshelf.Api
```

```http
GET https://localhost:7001/api/books HTTP/1.1
Accept: application/json
```

```xml
<Project Sdk="Microsoft.NET.Sdk.Web">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
</Project>
```

## Reto

::::challenge Implementa GET /api/books/{id}
Añade una acción que devuelva un libro por su identificador. Si no existe, responde `404 Not Found`.

:::hint
Usa el atributo `[HttpGet("{id:int}")]` para declarar la ruta.
:::

:::hint
Devuelve `NotFound()` cuando el libro no exista y `Ok(book)` cuando exista.
:::

:::solution
```csharp title="Controllers/BooksController.cs"
[HttpGet("{id:int}")]
public ActionResult<Book> GetById(int id)
{
    var book = _books.FirstOrDefault(b => b.Id == id);
    return book is null ? NotFound() : Ok(book);
}
```
:::
::::

:::checkpoint
Si ves este bloque con borde turquesa, el visor muestra bien los checkpoints.
:::

:::troubleshooting Errores comunes
- **El bloque no se renderiza:** revisa que `:::` esté en su propia línea.
- **Los colores no resaltan:** comprueba el lenguaje del bloque de código.
:::

:::recap
- Los bloques personalizados usan `:::tipo`.
- Los retos usan cuatro dos puntos para poder anidar pistas y solución.
:::
