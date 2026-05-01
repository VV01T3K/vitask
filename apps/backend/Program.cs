using backend;
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
    "Freezing",
    "Bracing",
    "Chilly",
    "Cool",
    "Mild",
    "Warm",
    "Balmy",
    "Hot",
    "Sweltering",
    "Scorching",
};

app.MapGet(
        "/weatherforecast",
        () =>
        {
            var forecast = Enumerable
                .Range(1, 5)
                .Select(index => new WeatherForecast(
                    DateOnly.FromDateTime(DateTime.Now.AddDays(index)),
                    Random.Shared.Next(-20, 55),
                    summaries[Random.Shared.Next(summaries.Length)]
                ))
                .ToArray();
            return forecast;
        }
    )
    .WithName("GetWeatherForecast");

app.MapPost(
        "/tasks",
        (CreateTaskRequest request) =>
        {
            var task = new TaskResponse(
                Guid.NewGuid(),
                request.Title!.Trim(),
                request.Notes?.Trim(),
                request.DueDate
            );

            return TypedResults.Created($"/tasks/{task.Id}", task);
        }
    )
    .WithName("CreateTask")
    .WithSummary("Create a task")
    .WithTags("Tasks")
    .WithFluentValidation<CreateTaskRequest>()
    .Produces<TaskResponse>(StatusCodes.Status201Created)
    .ProducesValidationProblem();

app.Run();
