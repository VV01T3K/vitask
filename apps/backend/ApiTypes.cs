using FluentValidation;

namespace backend;

sealed record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
{
    public int TemperatureF => 32 + (int)(TemperatureC / 0.5556);
}

public record CreateTaskRequest
{
    public string? Title { get; init; }

    public string? Notes { get; init; }

    public DateOnly? DueDate { get; init; }
}

public record TaskResponse(Guid Id, string Title, string? Notes, DateOnly? DueDate);

public sealed class CreateTaskRequestValidator : AbstractValidator<CreateTaskRequest>
{
    public CreateTaskRequestValidator()
    {
        RuleFor(task => task.Title).NotEmpty().Length(3, 120);

        RuleFor(task => task.Notes).MaximumLength(1_000);
    }
}

static class RouteHandlerBuilderValidationExtensions
{
    public static RouteHandlerBuilder WithFluentValidation<TRequest>(
        this RouteHandlerBuilder builder
    )
    {
        return builder.AddEndpointFilter(
            async (context, next) =>
            {
                var request = context.Arguments.OfType<TRequest>().FirstOrDefault();
                if (request is null)
                {
                    return await next(context);
                }

                var validator = context.HttpContext.RequestServices.GetService<
                    IValidator<TRequest>
                >();
                if (validator is null)
                {
                    return await next(context);
                }

                var validationResult = await validator.ValidateAsync(
                    request,
                    context.HttpContext.RequestAborted
                );
                if (validationResult.IsValid)
                {
                    return await next(context);
                }

                var errors = validationResult
                    .Errors.GroupBy(error => error.PropertyName)
                    .ToDictionary(
                        group => group.Key,
                        group => group.Select(error => error.ErrorMessage).ToArray()
                    );

                return TypedResults.ValidationProblem(errors);
            }
        );
    }
}
