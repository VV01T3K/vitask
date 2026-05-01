using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>();
builder.Services.AddFluentValidationRulesToOpenApi();

builder.Services.AddOpenApi(options => options.AddFluentValidationRules());

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.Title = "Vitask API";
    });
}

app.UseHttpsRedirection();

var summaries = new[]
{
    "Freezing", "Bracing", "Chilly", "Cool", "Mild", "Warm", "Balmy", "Hot", "Sweltering", "Scorching"
};

app.MapGet("/weatherforecast", () =>
{
    var forecast = Enumerable.Range(1, 5).Select(index =>
        new WeatherForecast
        (
            DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
            Random.Shared.Next(-20, 55),
            summaries[Random.Shared.Next(summaries.Length)]
        ))
        .ToArray();
    return forecast;
})
.WithName("GetWeatherForecast");

app.MapPost("/tasks", (CreateTaskRequest request) =>
{
    var task = new TaskResponse(
        Guid.NewGuid(),
        request.Title!.Trim(),
        request.Notes?.Trim(),
        request.DueDate);

    return TypedResults.Created($"/tasks/{task.Id}", task);
})
.WithName("CreateTask")
.WithSummary("Create a task")
.WithTags("Tasks")
.WithFluentValidation<CreateTaskRequest>()
.Produces<TaskResponse>(StatusCodes.Status201Created)
.ProducesValidationProblem();

app.Run();

record WeatherForecast(DateOnly Date, int TemperatureC, string? Summary)
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
        RuleFor(task => task.Title)
            .NotEmpty()
            .Length(3, 120);

        RuleFor(task => task.Notes)
            .MaximumLength(1_000);
    }
}

static class RouteHandlerBuilderValidationExtensions
{
    public static RouteHandlerBuilder WithFluentValidation<TRequest>(this RouteHandlerBuilder builder)
    {
        return builder.AddEndpointFilter(async (context, next) =>
        {
            var request = context.Arguments.OfType<TRequest>().FirstOrDefault();
            if (request is null)
            {
                return await next(context);
            }

            var validator = context.HttpContext.RequestServices.GetService<IValidator<TRequest>>();
            if (validator is null)
            {
                return await next(context);
            }

            var validationResult = await validator.ValidateAsync(request, context.HttpContext.RequestAborted);
            if (validationResult.IsValid)
            {
                return await next(context);
            }

            var errors = validationResult.Errors
                .GroupBy(error => error.PropertyName)
                .ToDictionary(
                    group => group.Key,
                    group => group.Select(error => error.ErrorMessage).ToArray());

            return TypedResults.ValidationProblem(errors);
        });
    }
}
