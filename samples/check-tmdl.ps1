param(
    [Parameter(Mandatory = $true)]
    [string]$TomAssemblyPath,
    [string]$DefinitionFolder = (Join-Path $PSScriptRoot 'SupportTickets\SupportTickets.SemanticModel\definition')
)

$ErrorActionPreference = 'Stop'
$assemblyPath = (Resolve-Path -LiteralPath $TomAssemblyPath).Path
$definition = (Resolve-Path -LiteralPath $DefinitionFolder).Path
Add-Type -Path $assemblyPath
$database = [Microsoft.AnalysisServices.Tabular.TmdlSerializer]::DeserializeDatabaseFromFolder($definition)
$model = $database.Model
if ($model.Tables.Count -ne 1 -or $model.Expressions.Count -ne 2) {
    throw 'Unexpected parsed sample table/expression counts.'
}
$table = $model.Tables['Prepared Transitions']
if ($null -eq $table -or $table.Columns.Count -ne 9 -or $table.Measures.Count -ne 2 -or $table.Partitions.Count -ne 1) {
    throw 'Unexpected parsed prepared-table structure.'
}
if ($null -eq $model.Expressions['CsvPath'] -or $null -eq $model.Expressions['PreparedCsvBase64']) {
    throw 'Parsed model is missing an offline sample expression.'
}
[ordered]@{
    scope = 'Official TOM deserialization/model-structure preflight only; no DAX/M execution, refresh, native render or UI.'
    definitionFolder = $definition
    tomAssemblyVersion = [Microsoft.AnalysisServices.Tabular.TmdlSerializer].Assembly.GetName().Version.ToString()
    tomAssemblySha256 = (Get-FileHash -LiteralPath $assemblyPath -Algorithm SHA256).Hash.ToLowerInvariant()
    powershellVersion = $PSVersionTable.PSVersion.ToString()
    dotnetVersion = [System.Environment]::Version.ToString()
    tables = $model.Tables.Count
    columns = $table.Columns.Count
    measures = $table.Measures.Count
    partitions = $table.Partitions.Count
    expressions = $model.Expressions.Count
} | ConvertTo-Json
