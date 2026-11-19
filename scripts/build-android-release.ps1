param([switch]$InitializeSigning)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$signingDirectory = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.wuxing-music/android-signing'
$keyStoreFile = Join-Path $signingDirectory 'release.p12'
$credentialFile = Join-Path $signingDirectory 'credentials.clixml'
$certificateFile = Join-Path $signingDirectory 'release-certificate.pem'

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:/Program Files/Android/Android Studio/jbr' }
$keyTool = Join-Path $env:JAVA_HOME 'bin/keytool.exe'
if (-not (Test-Path -LiteralPath $keyTool)) { throw '请先配置包含 keytool 的 JAVA_HOME。' }

if ($InitializeSigning) {
    if ((Test-Path -LiteralPath $keyStoreFile) -or (Test-Path -LiteralPath $credentialFile)) {
        throw '签名文件已存在，不覆盖；后续打包不需要 InitializeSigning。'
    }
    [IO.Directory]::CreateDirectory($signingDirectory) | Out-Null
    $directoryAcl = New-Object Security.AccessControl.DirectorySecurity
    $directoryAcl.SetAccessRuleProtection($true, $false)
    $owner = [Security.Principal.WindowsIdentity]::GetCurrent().User
    foreach ($principal in @($owner, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule($principal, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $directoryAcl.AddAccessRule($rule)
    }
    Set-Acl -LiteralPath $signingDirectory -AclObject $directoryAcl
    $randomBytes = New-Object byte[] 48
    $random = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $random.GetBytes($randomBytes) } finally { $random.Dispose() }
    $secret = ConvertTo-SecureString ([Convert]::ToBase64String($randomBytes)) -AsPlainText -Force
    [Array]::Clear($randomBytes, 0, $randomBytes.Length)
    $credential = New-Object Management.Automation.PSCredential('wuxing-release', $secret)
    # Windows DPAPI：只能由当前 Windows 用户解密；不保存明文密码。
    $credential | Export-Clixml -LiteralPath $credentialFile
}

if (-not (Test-Path -LiteralPath $credentialFile)) { throw '本机未保存正式签名。首次创建需显式使用 -InitializeSigning。' }
$credential = Import-Clixml -LiteralPath $credentialFile
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($credential.Password)
try {
    $env:WUXING_ANDROID_STORE_FILE = $keyStoreFile
    $env:WUXING_ANDROID_STORE_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
    $env:WUXING_ANDROID_KEY_ALIAS = $credential.UserName
    $env:WUXING_ANDROID_KEY_PASSWORD = $env:WUXING_ANDROID_STORE_PASSWORD
    if ($InitializeSigning) {
        & $keyTool -genkeypair -keystore $keyStoreFile -storetype PKCS12 -alias $credential.UserName -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=WuxingMusic Android Release' -storepass:env WUXING_ANDROID_STORE_PASSWORD -keypass:env WUXING_ANDROID_KEY_PASSWORD
        if ($LASTEXITCODE -ne 0) { throw '正式签名生成失败。请保留本机文件以便检查，不自动重建。' }
    }
    if (-not (Test-Path -LiteralPath $keyStoreFile)) { throw '正式签名文件缺失；不会创建新签名替代旧签名。' }
    & $keyTool -exportcert -rfc -keystore $keyStoreFile -alias $credential.UserName -storepass:env WUXING_ANDROID_STORE_PASSWORD -file $certificateFile
    if ($LASTEXITCODE -ne 0) { throw '无法验证正式证书；停止构建。' }
    & node (Join-Path $PSScriptRoot 'build-android.cjs') --release
    if ($LASTEXITCODE -ne 0) { throw '正式 APK 构建失败。' }
    Write-Output "正式签名保存在：$signingDirectory（不要删除，不进入源码仓库）"
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
    Remove-Item Env:WUXING_ANDROID_STORE_FILE, Env:WUXING_ANDROID_STORE_PASSWORD, Env:WUXING_ANDROID_KEY_ALIAS, Env:WUXING_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
    $credential = $null
}
