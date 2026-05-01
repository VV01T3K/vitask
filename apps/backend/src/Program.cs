using backend;
using FluentValidation;
using MicroElements.AspNetCore.OpenApi.FluentValidation;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddValidatorsFromAssemblyContaining<CreateTaskRequestValidator>();
builder.Services.AddFluentValidationRulesToOpenApi();
builder.Services.AddInMemorySqliteDatabase();
builder.Services.AddOpenApi(options => options.AddFluentValidationRules());

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

app.MapTaskEndpoints();

app.Run();
