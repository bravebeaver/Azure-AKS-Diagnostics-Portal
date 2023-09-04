import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SharedV2Module } from '../../shared-v2/shared-v2.module';
import { ResourceService } from '../../shared-v2/services/resource.service';
import { ResourceResolver } from '../../home/resolvers/resource.resolver';
import { RouterModule } from '@angular/router';
import { CategoryService } from '../../shared-v2/services/category.service';
import { ManagedClustersCategoryService } from './services/managed-clusters-category-service.service';
import { ContentService } from '../../shared-v2/services/content.service';
import { FeatureService } from '../../shared-v2/services/feature.service';
import { LoggingV2Service } from '../../shared-v2/services/logging-v2.service';
import { SupportTopicService } from '../../shared-v2/services/support-topic.service';
import { CXPChatCallerService } from '../../shared-v2/services/cxp-chat-caller.service';

const ResourceRoutes = RouterModule.forChild([
  {
    path: '',
    loadChildren: () => import('../../home/home.module').then(m => m.HomeModule),
    resolve: { data: ResourceResolver }
  },
  // the redirect service will rewrite the diagnostic tools blade to categories/aksinclusterdiagnostics/tools/Periscope" 
  {
    path: 'categories/aksinclusterdiagnostics/tools/:toolId',
    loadChildren: () => import('../../diagnostic-tools/diagnostic-tools.module').then(m => m.DiagnosticToolsModule)
  }
  
]);

@NgModule({
  imports: [
    CommonModule,
    SharedV2Module,
    ResourceRoutes
  ],
  declarations: [
    // InClusterDiagnosticToolsComponent
  ],
  providers: [
    ContentService,
    FeatureService,
    LoggingV2Service,
    CXPChatCallerService,
    ManagedClustersCategoryService,
    ResourceService,
    SupportTopicService,
    ResourceResolver,
    { provide: CategoryService, useExisting: ManagedClustersCategoryService },
  ]
})

export class ManagedClustersDiagnosticsModule { }
