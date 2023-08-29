import { Component, OnInit } from '@angular/core';
import { Category } from 'projects/app-service-diagnostics/src/app/shared-v2/models/category';

@Component({
  selector: 'in-cluster-diagnostic-tools',
  templateUrl: './in-cluster-diagnostic-tools.component.html',
  styleUrls: ['./in-cluster-diagnostic-tools.component.scss']
})
export class InClusterDiagnosticToolsComponent {

  toolCategories: Category[] = [];

  constructor() { }


}
