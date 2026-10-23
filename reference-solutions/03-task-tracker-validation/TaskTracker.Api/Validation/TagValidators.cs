using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateTagRequestValidator : AbstractValidator<CreateTagRequest>
{
    public CreateTagRequestValidator()
    {
        RuleFor(x => x.Name)
            .RequiredText(50)
            .Matches("^[a-zA-Z0-9-]+$")
            .WithMessage("Use only letters, numbers and hyphens.");
    }
}
