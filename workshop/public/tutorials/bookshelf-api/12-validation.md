## Objetivo del paso

Tu `POST` funciona, pero acepta cualquier cosa: un título vacío, un libro del año 5, un autor de 10.000 caracteres. En este paso protegerás la API para que **rechace los datos inválidos** antes de que lleguen a tu lógica. Vas a:

1. Entender por qué se valida **en el borde** de la aplicación.
2. Usar **DataAnnotations** (`[Required]`, `[StringLength]`, `[Range]`) en `CreateBookRequest`.
3. Ver cómo `[ApiController]` devuelve **automáticamente** un `400` sin que escribas código.
4. Leer y entender el formato **`ProblemDetails`** de los errores.
5. Practicar escribiendo peticiones `.http` que provoquen cada error.

## Por qué validar en el borde

:::concept Validar en el borde
El **borde** (*edge*) de tu aplicación es el punto donde entran datos de un origen que **no controlas**: el cliente. Cualquier cosa puede llegar: datos mal escritos, incompletos, absurdos o malintencionados. La regla de oro es **no confiar en los datos externos** y comprobarlos nada más entrar, antes de que el resto del código los dé por buenos.

Validar en el borde tiene tres ventajas:

- **Falla rápido:** el cliente recibe el error de inmediato, con un mensaje claro, sin que el dato recorra servicio y repositorio.
- **Protege tus capas internas:** el servicio y el repositorio pueden asumir que reciben datos con forma correcta, sin repetir comprobaciones por todas partes.
- **Una sola fuente de verdad:** las reglas viven junto al DTO que describe la entrada, donde se leen de un vistazo.
:::

Conviene distinguir dos tipos de reglas, porque se validan en sitios distintos:

| Tipo | Ejemplo | Dónde vive |
| --- | --- | --- |
| **Validación de forma** (la entrada está bien formada) | El título no está vacío; el año está entre 1000 y 2100. | En el DTO, con atributos. **Es lo que hacemos hoy.** |
| **Regla de negocio** (tiene sentido en nuestro sistema) | No se puede valorar un libro que no has leído; no puede haber dos libros con el mismo título. | En el servicio, con código. |

## DataAnnotations

:::concept DataAnnotations
**DataAnnotations** (espacio de nombres `System.ComponentModel.DataAnnotations`) son atributos que se colocan sobre las propiedades de una clase para declarar reglas de validación. Son **declarativos**: dices *qué* debe cumplirse, no *cómo* comprobarlo. ASP.NET Core los lee automáticamente tras el model binding.
:::

Los que usaremos en `CreateBookRequest`:

| Atributo | Regla | Mensaje por defecto (ejemplo) |
| --- | --- | --- |
| `[Required]` | El valor no puede ser `null` ni una cadena vacía. | `The Title field is required.` |
| `[StringLength(200)]` | La cadena no puede superar 200 caracteres (también admite `MinimumLength`). | `The field Title must be a string with a maximum length of 200.` |
| `[Range(1000, 2100)]` | El número debe estar entre los dos valores, ambos incluidos. | `The field Year must be between 1000 and 2100.` |

Otros que encontrarás en proyectos reales: `[MinLength]`, `[MaxLength]`, `[EmailAddress]`, `[Url]`, `[RegularExpression]` y `[Compare]`. Todos aceptan un parámetro `ErrorMessage` para personalizar el texto.

### Añade las reglas a CreateBookRequest

Abre `Dtos/CreateBookRequest.cs`, añade el `using` y los atributos:

```csharp title="Dtos/CreateBookRequest.cs"
using System.ComponentModel.DataAnnotations;

namespace Bookshelf.Api.Dtos;

public class CreateBookRequest
{
    [Required]
    [StringLength(200)]
    public string Title { get; set; } = string.Empty;

    [Required]
    [StringLength(100)]
    public string Author { get; set; } = string.Empty;

    [Range(1000, 2100)]
    public int Year { get; set; }

    [Required]
    [StringLength(50)]
    public string Genre { get; set; } = string.Empty;
}
```

Los atributos se apilan: `Title` es obligatorio **y** no puede pasar de 200 caracteres. No tocas nada más: ni el controller ni el servicio. Eso es lo bonito de la validación declarativa.

:::concept Tipos que no pueden ser null: el caso de Year
`Year` es un `int`, que **nunca es `null`**: si el cliente no envía la propiedad, el binder deja el valor por defecto, `0`. Por eso `[Required]` no tendría sentido y se usa `[Range]`: `0` queda fuera de 1000–2100, así que un `year` ausente también se rechaza (con el mensaje del rango, no con "required").

Si necesitaras distinguir entre "no enviado" y "enviado como 0", el tipo sería `int?` junto con `[Required]`. Para este tutorial no hace falta.
:::

## Cómo se produce el 400 automático

No has escrito ningún `if (!valid) return BadRequest()`, y sin embargo la API rechazará los datos incorrectos. ¿Quién lo hace?

:::concept Validación automática con [ApiController]
Este es el flujo, y todo ocurre **antes** de que se ejecute el código de tu acción:

```
Petición ──▶ Routing ──▶ Model binding ──▶ Validación (DataAnnotations)
                         (JSON → objeto)    rellena ModelState con los errores
                                                     │
                                  ┌──────────────────┴────────────────┐
                           ¿ModelState válido?                        │
                              sí │                                    │ no
                                 ▼                                    ▼
                         se ejecuta tu acción        el filtro ModelStateInvalidFilter
                                                     responde 400 y la acción NO se ejecuta
```

`ModelState` es un diccionario que acumula, por propiedad, los errores del binding y de la validación. `[ApiController]` añade un filtro (`ModelStateInvalidFilter`) que comprueba `ModelState.IsValid` antes de la acción; si hay errores, responde `400` con un `ValidationProblemDetails` y **tu acción no llega a ejecutarse**.

Por eso en una acción con `[ApiController]` **no hace falta** escribir `if (!ModelState.IsValid)`. (En controllers sin ese atributo sí había que hacerlo a mano.)
:::

## ProblemDetails

¿Qué forma tiene la respuesta de error? Antes, cada API inventaba su formato (`{"error": "..."}`, `{"message": "..."}`…), y los clientes tenían que adaptarse a cada una. Existe un estándar para evitarlo.

:::concept ProblemDetails (RFC 9457)
**Problem Details** es un formato JSON estándar para describir errores HTTP, definido en la **RFC 9457** (que sustituye a la anterior RFC 7807). Se sirve con el tipo de contenido `application/problem+json`. Sus campos principales son:

| Campo | Significado |
| --- | --- |
| `type` | Una URI que identifica el **tipo** de problema. ASP.NET Core usa enlaces a la RFC 9110, que define el significado de cada código HTTP (por eso verás `rfc9110` y no `rfc9457` en el valor). |
| `title` | Un resumen corto y legible del problema. |
| `status` | El código HTTP (se repite aquí por comodidad). |
| `detail` | Una explicación más específica de esta ocurrencia concreta (opcional). |
| `instance` | Una URI de esta ocurrencia concreta (opcional). |
| *extensiones* | Campos extra. ASP.NET Core añade `traceId` (identificador de la petición, útil para localizar el error en los logs) y, en validación, `errors`. |
:::

Para los errores de validación se usa su variante **`ValidationProblemDetails`**, que añade el campo `errors`: un objeto cuyas claves son los nombres de las propiedades y cuyos valores son **listas** de mensajes (una propiedad puede incumplir varias reglas).

## Pruébalo

Añade esta petición a `Bookshelf.Api.http`, después de la de crear:

```http title="Bookshelf.Api.http (petición adicional)"
### Create with invalid data (400 validation problem)
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{
  "title": "",
  "author": "Someone",
  "year": 5,
  "genre": "Fiction"
}
```

Tiene dos errores a propósito: título vacío y año fuera de rango. Ejecuta la API y envíala:

:::checkpoint Un 400 con todos los errores a la vez
La respuesta es **`400 Bad Request`**, con `Content-Type: application/problem+json`, y un cuerpo así (el `traceId` cambia):

```json
{
  "type": "https://tools.ietf.org/html/rfc9110#section-15.5.1",
  "title": "One or more validation errors occurred.",
  "status": 400,
  "errors": {
    "Year": [ "The field Year must be between 1000 and 2100." ],
    "Title": [ "The Title field is required." ]
  },
  "traceId": "00-620309031515caac60a42328e5b9ae92-89f717c17b56ac01-00"
}
```

Observa tres cosas:

1. **Los dos errores llegan juntos.** El cliente puede corregir todo de una vez en lugar de ir descubriéndolos de uno en uno.
2. Las claves de `errors` son los nombres de las propiedades en C# (`Title`, `Year`), y los valores son listas.
3. **No se creó ningún libro.** Comprueba con `GET /api/books` que sigue habiendo ocho (o los que tuvieras) y mira la consola: no hay ningún log `Created book`, porque la acción ni se ejecutó.

Comprueba también que una petición **válida** sigue funcionando: `POST` con título `"Pedro Páramo"` y año `1955` devuelve `201`. Un año de `1000` o de `2100` también es válido: los extremos del `[Range]` están incluidos.
:::

:::tip Mensajes de error de JSON mal formado
Si el cuerpo no es JSON válido, o un valor tiene el tipo equivocado (por ejemplo `"year": "abc"`), el error no viene de DataAnnotations sino del propio binder, y tiene claves como `$.year` con un mensaje del tipo `The JSON value could not be converted to System.Int32`. El formato de respuesta (`ValidationProblemDetails`) es el mismo.
:::

## Nullable reference types y [Required]

Quizá te preguntes por qué hace falta `[Required]` si `Title` ya es un `string` no anulable (`string`, no `string?`). Hay dos mecanismos distintos:

- Con `Nullable` activado, ASP.NET Core trata implícitamente los **tipos de referencia no anulables** como obligatorios *respecto de `null`*. Si el cliente envía `"title": null`, ya se rechazaría con `The Title field is required.` aunque no tuviera `[Required]`.
- Pero una propiedad **ausente** del JSON no queda en `null`: se queda con su valor inicial, que es `string.Empty` (el `= string.Empty` del paso 7). Y una cadena vacía no es `null`, así que pasaría. `[Required]` sí rechaza la cadena vacía (por defecto no permite vacíos).

Por eso, para textos: `= string.Empty` evita avisos del compilador y valores `null` inesperados, y `[Required]` hace que ausente o vacío sea un error.

## Rangos en tipos anulables

Un caso que verás en el paso siguiente: `MarkAsReadRequest` tiene una valoración opcional.

```csharp title="Dtos/MarkAsReadRequest.cs (avance del paso 13)"
public class MarkAsReadRequest
{
    // Optional: a book can be marked as read without rating it.
    [Range(1, 5)]
    public int? Rating { get; set; }
}
```

Con `int?`, `[Range(1, 5)]` **solo valida cuando hay valor**: si `rating` no se envía (o es `null`) la validación se salta y es válido; si se envía `0` o `6`, falla. Es justo lo que queremos para algo opcional. Si el atributo fuera `[Required]`, entonces sí sería obligatorio.

:::troubleshooting Errores comunes
- **Los datos inválidos se aceptan y no hay `400`:** comprueba que el controller lleva `[ApiController]` (es quien activa la validación automática) y que pusiste los atributos en la clase que **realmente** recibe la acción (`CreateBookRequest`), no en `Book`.
- **`CS0246: The type or namespace name 'RequiredAttribute' could not be found`:** falta `using System.ComponentModel.DataAnnotations;`.
- **`[Range]` rechaza el valor `1000` o `2100`:** no debería; los extremos están incluidos. Revisa que no hayas escrito `[Range(1001, 2099)]`.
- **Un `year` ausente da el error del rango y no el de `required`:** es lo esperado (ver arriba): al faltar, vale `0`.
- **El mensaje de error está en inglés:** los mensajes por defecto vienen en inglés. Puedes personalizarlos con `ErrorMessage`, por ejemplo `[Required(ErrorMessage = "Title is required")]`.
- **`415 Unsupported Media Type`:** falta `Content-Type: application/json` en la petición.
:::

::::challenge Una petición .http por cada regla
Ya sabes provocar un error de validación. Ahora ponte en el lugar de quien **prueba** la API: escribe en `Bookshelf.Api.http` una petición `POST` por cada una de estas situaciones, y comprueba que todas devuelven `400` con el mensaje esperado:

1. El `author` está vacío.
2. El `genre` no se envía en absoluto.
3. El `title` supera los 200 caracteres.
4. El `year` es `2101`.
5. El `year` es `"abc"` (un texto en vez de un número).
6. El cuerpo no es JSON válido (por ejemplo, falta la llave final).

Para cada una, antes de ejecutar, **predice** la clave de `errors` y el mensaje.

:::hint
Todas tienen la misma estructura que la petición inválida que ya tienes: la línea `POST`, la cabecera `Content-Type` y un cuerpo JSON. Cada una debe ir separada de las demás por una línea `###` con un comentario descriptivo. Parte de un cuerpo válido y estropea **solo una cosa** cada vez.
:::

:::hint
Para el caso 3 no hace falta teclear 201 caracteres: una cadena larga de `x` repetida, o texto copiado varias veces, sirve (la regla es `[StringLength(200)]`). El caso 5 no es un error de DataAnnotations sino del binder: su clave será `$.year`. En el caso 6, el cuerpo termina sin cerrar la llave.
:::

:::solution
```http title="Bookshelf.Api.http (peticiones adicionales)"
### Validation: empty author
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{ "title": "T", "author": "", "year": 2000, "genre": "Fiction" }

### Validation: genre not sent
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{ "title": "T", "author": "A", "year": 2000 }

### Validation: title longer than 200 characters
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{
  "title": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "author": "A",
  "year": 2000,
  "genre": "Fiction"
}

### Validation: year out of range
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{ "title": "T", "author": "A", "year": 2101, "genre": "Fiction" }

### Validation: year is not a number
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{ "title": "T", "author": "A", "year": "abc", "genre": "Fiction" }

### Validation: malformed JSON
POST {{Bookshelf.Api_HostAddress}}/api/books
Content-Type: application/json

{ "title": "T", "author": "A", "year": 2000, "genre": "Fiction"
```

Resultados esperados (siempre `400 Bad Request` y `application/problem+json`):

| Caso | Clave en `errors` | Mensaje |
| --- | --- | --- |
| 1. Author vacío | `Author` | `The Author field is required.` |
| 2. Genre ausente | `Genre` | `The Genre field is required.` (ausente = `""`, que `[Required]` rechaza) |
| 3. Title demasiado largo | `Title` | `The field Title must be a string with a maximum length of 200.` |
| 4. Year 2101 | `Year` | `The field Year must be between 1000 and 2100.` |
| 5. Year `"abc"` | `$.year` (y `request`) | `The JSON value could not be converted to System.Int32. Path: $.year ...` |
| 6. JSON incompleto | `$` (y `request`) | `Expected depth to be zero at the end of the JSON payload...` |

Qué aprendes de aquí:

- Los casos 1 a 4 son **validación de DataAnnotations**: llegan a `ModelState` tras el binding correcto del cuerpo.
- Los casos 5 y 6 son **fallos del binder** (el JSON ni siquiera se puede convertir al objeto), y por eso las claves empiezan por `$`. El `request` extra indica que no pudo construirse el objeto. Ambos producen el mismo formato `ValidationProblemDetails`, así que el cliente los trata igual.
- Ninguna de las seis llega al servicio: no verás logs de `BookService` ni cambios en `books.json`.
:::
::::

:::recap
- Se valida **en el borde**: los datos del cliente no son de fiar, y fallar rápido protege el resto del código.
- **DataAnnotations** (`[Required]`, `[StringLength]`, `[Range]`) declaran las reglas de forma sobre las propiedades del DTO.
- Con `[ApiController]`, una entrada inválida produce un `400` **automático** (`ModelStateInvalidFilter`) y la acción no se ejecuta; no hace falta comprobar `ModelState`.
- Los errores se devuelven como **ProblemDetails** (RFC 9457) con `Content-Type: application/problem+json`; en validación incluyen `errors` (propiedad → lista de mensajes) y `traceId`.
- Un `year` ausente vale `0` y falla el rango; `[Required]` rechaza `null` y cadenas vacías; `[Range]` sobre `int?` solo valida si hay valor.
- Las reglas de negocio ("no valorar un libro sin leer") no son de forma y vivirán en el servicio.

En el siguiente paso completarás el CRUD: implementarás `PUT`, `DELETE` y `PATCH` casi por tu cuenta, porque ya has practicado todas las capas.
:::
