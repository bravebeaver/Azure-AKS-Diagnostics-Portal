import { Injectable } from '@angular/core';
import { Category } from '../../../shared-v2/models/category';
import { CategoryService } from '../../../shared-v2/services/category.service';
import { ResourceService } from '../../../shared-v2/services/resource.service';
import { ArmResourceConfig } from '../../../shared/models/arm/armResourceConfig';
import { GenericArmConfigService } from '../../../shared/services/generic-arm-config.service';
import { PortalActionService } from '../../../shared/services/portal-action.service';
import { DetectorType } from 'diagnostic-data';
import { ToolIds } from '../../../shared/models/tools-constants';
@Injectable()
export class ManagedClustersCategoryService extends CategoryService{
  constructor (private _resourceService: ResourceService, 
              private _armConfigService: GenericArmConfigService, 
              private _portalService: PortalActionService) { 
    super();

    // add original categories from config.json
    let currConfig: ArmResourceConfig = _armConfigService.getArmResourceConfig(_resourceService.resource.id);
    if (currConfig.categories && currConfig.categories.length > 0) {
      console.log(currConfig.categories);
      this._addCategories(currConfig.categories);
    }
    
    // add new categories that are not applens detectors.
    this._addCategories(this.getInClusterDiagnosticCategories( this._resourceService.resourceIdForRouting));
  }

  getInClusterDiagnosticCategories(clusterUri: string): Category[] {
    return <Category[]> 
      [
        {
          id: "aksinclusterdiagnostics",
          name: "In-Cluster Diagnostic Tools",
          overviewDetectorId: 'aks-inclusterdiagnostics',
          description: "Diagnostic tools for cluster specific troubleshooting.",
          keywords: ["Periscope", "Inspektor Gadget"],
          categoryQuickLinks: [{
              displayText: "AKS Periscope",
              id:  ToolIds.AKSPeriscope, 
              type: DetectorType.DiagnosticTool,
          }],
          color: "rgb(186, 211, 245)",
          createFlowForCategory: false,
          chatEnabled: false,
          // this is only useful in container-tile, not v4
          overridePath: `resource${clusterUri}/aksinclusterdiagnostics`
      }];
    
  }
}
