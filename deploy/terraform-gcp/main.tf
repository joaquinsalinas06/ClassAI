resource "google_compute_network" "classai" {
  name                    = "classai-network"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "classai" {
  name          = "classai-subnet"
  region        = var.region
  network       = google_compute_network.classai.id
  ip_cidr_range = "10.42.0.0/24"
}

resource "google_service_account" "vm" {
  account_id   = "classai-vm"
  display_name = "ClassAI VM sin roles de proyecto"
}

resource "google_compute_disk" "data" {
  name = "classai-data"
  type = "pd-standard"
  zone = var.zone
  size = var.data_disk_gb

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_address" "classai" {
  name   = "classai-ip"
  region = var.region
}

resource "google_compute_instance" "classai" {
  name         = "classai-demo"
  machine_type = var.machine_type
  zone         = var.zone
  tags         = ["classai-demo"]

  boot_disk {
    auto_delete = true
    initialize_params {
      image = "debian-cloud/debian-12"
      type  = "pd-standard"
      size  = 20
    }
  }

  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "classai-data"
  }

  network_interface {
    subnetwork = google_compute_subnetwork.classai.id
    access_config {
      nat_ip = google_compute_address.classai.address
    }
  }

  metadata = {
    enable-oslogin = "TRUE"
  }

  shielded_instance_config {
    enable_secure_boot          = true
    enable_vtpm                 = true
    enable_integrity_monitoring = true
  }

  service_account {
    email  = google_service_account.vm.email
    scopes = ["cloud-platform"]
  }
}

resource "google_compute_firewall" "iap_ssh" {
  name          = "classai-iap-ssh"
  network       = google_compute_network.classai.id
  direction     = "INGRESS"
  source_ranges = ["35.235.240.0/20"]
  target_tags   = ["classai-demo"]
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}

resource "google_compute_firewall" "web" {
  count         = length(var.web_source_ranges) > 0 ? 1 : 0
  name          = "classai-web"
  network       = google_compute_network.classai.id
  direction     = "INGRESS"
  source_ranges = var.web_source_ranges
  target_tags   = ["classai-demo"]
  allow {
    protocol = "tcp"
    ports    = ["80", "443"]
  }
}

resource "google_compute_firewall" "mqtt" {
  count         = length(var.mqtt_source_ranges) > 0 ? 1 : 0
  name          = "classai-mqtt-tls"
  network       = google_compute_network.classai.id
  direction     = "INGRESS"
  source_ranges = var.mqtt_source_ranges
  target_tags   = ["classai-demo"]
  allow {
    protocol = "tcp"
    ports    = ["8883"]
  }
}

# La ventana 23:45–00:00 contempla el retraso documentado del programador de GCP.
data "google_project" "current" {}

resource "google_project_iam_custom_role" "scheduler" {
  role_id     = "classaiInstanceScheduler"
  title       = "ClassAI: programar estado de VM"
  permissions = ["compute.instances.start", "compute.instances.stop"]
}

resource "google_compute_instance_iam_member" "scheduler" {
  instance_name = google_compute_instance.classai.name
  zone          = var.zone
  role          = google_project_iam_custom_role.scheduler.name
  member        = "serviceAccount:service-${data.google_project.current.number}@compute-system.iam.gserviceaccount.com"
}

resource "google_compute_resource_policy" "nightly_stop" {
  name   = "classai-nightly-stop"
  region = var.region
  instance_schedule_policy {
    vm_stop_schedule {
      schedule = "45 23 * * *"
    }
    time_zone = "America/Lima"
  }
}

resource "google_compute_resource_policy_attachment" "nightly_stop" {
  name       = google_compute_resource_policy.nightly_stop.name
  instance   = google_compute_instance.classai.name
  zone       = var.zone
  depends_on = [google_compute_instance_iam_member.scheduler]
}
