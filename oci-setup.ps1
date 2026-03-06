# VEXOR OCI Setup Script
# Creates compute instance and deploys the application

$Env:OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING = "True"

Write-Host "============================================================"
Write-Host "  VEXOR - Oracle Cloud Infrastructure Setup"
Write-Host "============================================================"

# Load environment variables
$envPath = Join-Path $PSScriptRoot ".env"
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object {
        if ($_ -match "^([^#][^=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
}

$tenancyId = $Env:OCI_TENANCY_OCID
$region = $Env:OCI_REGION -replace "-", "" # sa-saopaulo1

Write-Host "Tenancy: $tenancyId"
Write-Host "Region: $Env:OCI_REGION"

# Get availability domain
Write-Host "`n[1/6] Getting availability domain..."
$adJson = oci iam availability-domain list --compartment-id $tenancyId 2>$null
$ad = ($adJson | ConvertFrom-Json).data[0].name
Write-Host "Availability Domain: $ad"

# List existing instances
Write-Host "`n[2/6] Checking existing instances..."
$instancesJson = oci compute instance list --compartment-id $tenancyId 2>$null
$instances = $instancesJson | ConvertFrom-Json
Write-Host "Found $($instances.data.Count) existing instances"

# Check if vexor-api exists
$vexorInstance = $instances.data | Where-Object { $_.display_name -eq "vexor-api" }
if ($vexorInstance) {
    Write-Host "vexor-api instance already exists: $($vexorInstance.id)"
    $instanceId = $vexorInstance.id
} else {
    Write-Host "`n[3/6] Creating vexor-api instance..."
    
    # Get VCN
    $vcnJson = oci network vcn list --compartment-id $tenancyId 2>$null
    $vcns = $vcnJson | ConvertFrom-Json
    
    if ($vcns.data.Count -eq 0) {
        Write-Host "Creating VCN..."
        $vcnCreate = oci network vcn create `
            --compartment-id $tenancyId `
            --display-name "vexor-vcn" `
            --cidr-block "10.0.0.0/16" `
            --dns-label "vexor" `
            --wait-for-state AVAILABLE 2>$null
        $vcn = ($vcnCreate | ConvertFrom-Json).data
        $vcnId = $vcn.id
        
        # Create subnet
        Write-Host "Creating subnet..."
        $subnetCreate = oci network subnet create `
            --compartment-id $tenancyId `
            --vcn-id $vcnId `
            --display-name "vexor-public-subnet" `
            --cidr-block "10.0.0.0/24" `
            --availability-domain $ad `
            --dns-label "vexorsubnet" `
            --skip-source-dns-check true `
            --wait-for-state AVAILABLE 2>$null
        $subnet = ($subnetCreate | ConvertFrom-Json).data
        $subnetId = $subnet.id
        
        # Create security list (allow ports 80, 443, 3000, 5174)
        Write-Host "Creating security list..."
        oci network security-list create `
            --compartment-id $tenancyId `
            --vcn-id $vcnId `
            --display-name "vexor-security-list" `
            --egress-security-rules '[{"destination":"0.0.0.0/0","protocol":"all","isStateless":false}]' `
            --ingress-security-rules '[{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":22,"max":22}}},{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":80,"max":80}}},{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":443,"max":443}}},{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":3000,"max":3000}}},{"source":"0.0.0.0/0","protocol":"6","isStateless":false,"tcpOptions":{"destinationPortRange":{"min":5174,"max":5174}}}]' 2>$null
    } else {
        $vcnId = $vcns.data[0].id
        $subnetJson = oci network subnet list --compartment-id $tenancyId --vcn-id $vcnId 2>$null
        $subnets = $subnetJson | ConvertFrom-Json
        $subnetId = $subnets.data[0].id
    }
    
    Write-Host "VCN: $vcnId"
    Write-Host "Subnet: $subnetId"
    
    # Get image (Oracle Linux 8)
    Write-Host "Getting image..."
    $imagesJson = oci compute image list --compartment-id $tenancyId --operating-system "Oracle Linux" --operating-system-version "8" 2>$null
    $images = $imagesJson | ConvertFrom-Json
    $imageId = $images.data[0].id
    
    # Create instance
    Write-Host "Creating compute instance..."
    $instanceJson = oci compute instance launch `
        --availability-domain $ad `
        --compartment-id $tenancyId `
        --display-name "vexor-api" `
        --shape "VM.Standard.E4.Flex" `
        --shape-config '{"memoryInGBs":8,"ocpus":2}' `
        --source-details "{\"sourceType\":\"image\",\"imageId\":\"$imageId\"}" `
        --create-vnic-details "{\"subnetId\":\"$subnetId\",\"assignPublicIp\":true}" `
        --ssh-authorized-keys-file "$Env:USERPROFILE\.oci\private_key.pem" `
        --wait-for-state RUNNING 2>$null
    
    $instance = $instanceJson | ConvertFrom-Json
    $instanceId = $instance.data.id
    Write-Host "Instance created: $instanceId"
}

# Get public IP
Write-Host "`n[4/6] Getting public IP..."
$vnicJson = oci compute vnic-attachment list --compartment-id $tenancyId --instance-id $instanceId 2>$null
$vnics = $vnicJson | ConvertFrom-Json
$publicIp = $vnics.data[0].public_ip
Write-Host "Public IP: $publicIp"

# Save IP to .env
Add-Content -Path $envPath -Value "`nOCI_PUBLIC_IP=$publicIp"
Add-Content -Path $envPath -Value "VEXOR_PUBLIC_URL=http://$publicIp"

Write-Host "`n============================================================"
Write-Host "  OCI Setup Complete!"
Write-Host "============================================================"
Write-Host "  Public URL: http://$publicIp"
Write-Host "  API: http://$publicIp`:3000"
Write-Host "  Web: http://$publicIp`:5174"
Write-Host "============================================================"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. SSH to instance: ssh opc@$publicIp"
Write-Host "  2. Install Node.js: sudo dnf install nodejs"
Write-Host "  3. Copy project: scp -r $PSScriptRoot opc@${publicIp}:/home/opc/vexor"
Write-Host "  4. Run deploy script on instance"
Write-Host ""
