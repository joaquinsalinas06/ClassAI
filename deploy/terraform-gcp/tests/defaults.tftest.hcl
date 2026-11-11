mock_provider "google" {}

run "private_by_default" {
  command = plan

  variables {
    project_id         = "classai-demo-example"
    web_source_ranges  = []
    mqtt_source_ranges = []
  }

  assert {
    condition     = length(google_compute_firewall.web) == 0 && length(google_compute_firewall.mqtt) == 0
    error_message = "La web y MQTT deben permanecer cerrados por defecto."
  }

  assert {
    condition     = google_compute_instance.classai.machine_type == "e2-medium"
    error_message = "La VM inicial debe ofrecer 4 GiB."
  }

  assert {
    condition     = google_compute_firewall.iap_ssh.source_ranges == toset(["35.235.240.0/20"])
    error_message = "SSH solo debe aceptar el rango de IAP."
  }
}

run "allow_configured_cidrs_only" {
  command = plan

  variables {
    project_id         = "classai-demo-example"
    web_source_ranges  = ["203.0.113.0/24"]
    mqtt_source_ranges = ["198.51.100.0/24"]
  }

  assert {
    condition     = google_compute_firewall.web[0].source_ranges == toset(["203.0.113.0/24"]) && google_compute_firewall.mqtt[0].source_ranges == toset(["198.51.100.0/24"])
    error_message = "Cada servicio solo debe aceptar los CIDR solicitados."
  }
}
