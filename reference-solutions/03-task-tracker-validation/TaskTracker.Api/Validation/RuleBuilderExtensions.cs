using FluentValidation;

namespace TaskTracker.Api.Validation;

// Rules shared by several validators, written once.
public static class RuleBuilderExtensions
{
    public static IRuleBuilderOptions<T, string> RequiredText<T>(this IRuleBuilderInitial<T, string> rule, int maxLength) =>
        rule
            .Cascade(CascadeMode.Stop) // An empty value reports one error, not two.
            .NotEmpty()
            .MaximumLength(maxLength);
}
