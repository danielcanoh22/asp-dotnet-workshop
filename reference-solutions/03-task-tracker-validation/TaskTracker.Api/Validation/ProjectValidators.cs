using FluentValidation;
using TaskTracker.Api.Contracts;

namespace TaskTracker.Api.Validation;

public class CreateProjectRequestValidator : AbstractValidator<CreateProjectRequest>
{
    public CreateProjectRequestValidator()
    {
        RuleFor(x => x.Name).RequiredText(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}

public class UpdateProjectRequestValidator : AbstractValidator<UpdateProjectRequest>
{
    public UpdateProjectRequestValidator()
    {
        RuleFor(x => x.Name).RequiredText(100);
        RuleFor(x => x.Description).MaximumLength(500);
    }
}
