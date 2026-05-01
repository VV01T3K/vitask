using backend;
using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

const string FrontendCorsPolicy = "Frontend";

builder.Services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>();
builder.Services.AddFluentValidationRulesToOpenApi();
builder.Services.AddInMemorySqliteDatabase();
builder.Services.AddOpenApi(options => options.AddFluentValidationRules());
builder.Services.AddCors(options =>
{
    options.AddPolicy(
        FrontendCorsPolicy,
        policy =>
        {
            var configuredOrigins = builder
                .Configuration.GetSection("Cors:AllowedOrigins")
                .GetChildren()
                .Select(section => section.Value)
                .OfType<string>()
                .ToArray();

            var allowedOrigins =
                builder.Environment.IsDevelopment() && configuredOrigins.Length == 0
                    ? ["http://localhost:3000"]
                    : configuredOrigins;

            policy.WithOrigins(allowedOrigins).AllowAnyHeader().AllowAnyMethod();
        }
    );
});

var app = builder.Build();

app.EnsureDatabaseCreated();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.Title = "Vitask API";
        options.WithDefaultHttpClient(ScalarTarget.Node, ScalarClient.Fetch);
    });
}

app.UseHttpsRedirection();
app.UseCors(FrontendCorsPolicy);

app.MapTaskEndpoints();

app.Run();
