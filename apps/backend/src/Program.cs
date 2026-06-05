using backend;
using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

const string FrontendCorsPolicy = "Frontend";

var scalarEnabled = builder.Configuration.GetValue(
    "Scalar:Enabled",
    builder.Environment.IsDevelopment()
);
var scalarBaseServerUrl =
    builder.Configuration.GetValue<string>("Scalar:BaseServerUrl")
    ?? builder.Configuration.GetValue<string>("PUBLIC_BACKEND_URL");
var railwayPublicDomain = builder.Configuration.GetValue<string>("RAILWAY_PUBLIC_DOMAIN");

if (
    string.IsNullOrWhiteSpace(scalarBaseServerUrl)
    && !string.IsNullOrWhiteSpace(railwayPublicDomain)
)
{
    scalarBaseServerUrl = railwayPublicDomain.StartsWith("http", StringComparison.OrdinalIgnoreCase)
        ? railwayPublicDomain
        : $"https://{railwayPublicDomain}";
}

builder.Services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>();
builder.Services.AddInMemorySqliteDatabase();
builder.Services.AddOpenApi(options => options.AddFluentValidationRules());
builder.Services.AddFluentValidationRulesToOpenApi();
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

if (scalarEnabled)
{
    app.MapOpenApi();
    app.MapScalarApiReference(options =>
    {
        options.Title = "Vitask API";
        options.WithDefaultHttpClient(ScalarTarget.Node, ScalarClient.Fetch);

        if (!string.IsNullOrWhiteSpace(scalarBaseServerUrl))
        {
            options.WithBaseServerUrl(scalarBaseServerUrl);
            options.AddServer(scalarBaseServerUrl, "Vitask API");
        }
    });
}

if (!app.Environment.IsProduction())
{
    app.UseHttpsRedirection();
}
app.UseCors(FrontendCorsPolicy);

app.MapGet("/healthz", () => Results.Text("ok")).ExcludeFromDescription();
app.MapTaskEndpoints();
app.MapTimerEndpoints();

app.Run();
