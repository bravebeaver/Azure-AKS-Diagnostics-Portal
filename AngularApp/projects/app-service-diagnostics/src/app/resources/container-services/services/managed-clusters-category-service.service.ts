import { Injectable } from '@angular/core';
import { Category } from '../../../shared-v2/models/category';
import { CategoryService } from '../../../shared-v2/services/category.service';
import { ResourceService } from '../../../shared-v2/services/resource.service';
import { ArmResourceConfig } from '../../../shared/models/arm/armResourceConfig';
import { GenericArmConfigService } from '../../../shared/services/generic-arm-config.service';
import { DetectorType } from 'diagnostic-data';
@Injectable()
export class ManagedClustersCategoryService extends CategoryService{

  private _inClusterDiagnosticCategories: Category[] =  [
    {
      id: "InClusterDiagnosisAKS",
      name: "In-Cluster Diagnostic Tools",
      description: "Diagnostic tools for cluster specific troubleshooting.",
      keywords: ["Periscope", "Inspektor Gadget"],
      categoryQuickLinks: [{
          displayText: "AKS Periscope",
          id:  "aksincluster-periscope",
          type: DetectorType.DiagnosticTool
      }],
      color: "rgb(186, 211, 245)",
      createFlowForCategory: true,
      chatEnabled: false,
      overviewDetectorId: 'aks-incluster-diagnostics',
      overridePath: `resource${this._resourceService.resourceIdForRouting}/inClusterDiagnosticTools`
  }];

  constructor(private _resourceService: ResourceService, private _armConfigService: GenericArmConfigService) { 
    super();
    
    let currConfig: ArmResourceConfig = _armConfigService.getArmResourceConfig(_resourceService.resource.id);
    
    // add original categories from config.json
    if (currConfig.categories && currConfig.categories.length > 0) {
      console.log(currConfig.categories);
      this._addCategories(currConfig.categories);
    }
  
    // add new categories that are not applens detectors.
    this._addCategories(this._inClusterDiagnosticCategories);
  }
}
