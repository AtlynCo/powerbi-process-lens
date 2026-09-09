param([Parameter(Mandatory = $true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
# An ephemeral in-memory certificate satisfies the SDK packager's dev-server
# configuration without installing or trusting a certificate in a user store.
[System.IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
try {
    $request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
        'CN=localhost', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256,
        [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $certificate = $request.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1), [DateTimeOffset]::UtcNow.AddDays(7))
    try {
        $password = [Guid]::NewGuid().ToString('N')
        $bytes = $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $password)
        [System.IO.File]::WriteAllBytes((Join-Path $OutputDirectory 'PowerBICustomVisualTest_public.pfx'), $bytes)
        [System.IO.File]::WriteAllText((Join-Path $OutputDirectory 'PowerBICustomVisualTestPass.txt'), $password)
    } finally {
        $certificate.Dispose()
    }
} finally {
    $rsa.Dispose()
}
