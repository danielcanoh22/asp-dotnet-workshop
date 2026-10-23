namespace TaskTracker.Api.Validation;

public static class ValidationExtensions
{
    // Adds the filter and documents the 400 response in OpenAPI, in one call.
    public static RouteHandlerBuilder WithValidation<T>(this RouteHandlerBuilder builder) =>
        builder
            .AddEndpointFilter<ValidationFilter<T>>()
            .ProducesValidationProblem();
}
