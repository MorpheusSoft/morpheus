import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategoryService, Category } from '../services/category.service';
import { RouterModule } from '@angular/router';
import { TreeTableModule } from 'primeng/treetable';
import { TreeNode } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-category-list',
  standalone: true,
  imports: [CommonModule, RouterModule, TreeTableModule, ButtonModule, TagModule],
  template: `
    <div class="category-list-container">
        <div class="list-header">
            <div>
                <h2 class="list-title">Categorías</h2>
                <p class="list-subtitle">Gestiona las clasificaciones de tus productos</p>
            </div>
            <p-button label="Nueva Categoría" icon="pi pi-plus" routerLink="/catalog/categories/new"></p-button>
        </div>

        <div class="list-card">
            <p-treeTable [value]="categoriesTree" [scrollable]="true" scrollHeight="600px" [rowHover]="true" styleClass="p-treetable-sm">
                <ng-template pTemplate="header">
                    <tr>
                        <th>Nombre</th>
                        <th>URL (Slug)</th>
                        <th>Estado</th>
                        <th style="width: 15rem" class="text-center">Acciones</th>
                    </tr>
                </ng-template>
                <ng-template pTemplate="body" let-rowNode let-rowData="rowData">
                    <tr [ttRow]="rowNode">
                        <td>
                            <p-treeTableToggler [rowNode]="rowNode"></p-treeTableToggler>
                            <i class="pi" [ngClass]="rowNode.node.children?.length ? 'pi-folder' : 'pi-tag'" style="margin-right: 0.5rem; color: var(--p-primary-color)"></i>
                            <span [class.fw-bold]="rowNode.level === 0">{{ rowData.name }}</span>
                        </td>
                        <td class="text-secondary">{{ rowData.slug }}</td>
                        <td>
                            <p-tag [value]="rowData.is_active ? 'Activo' : 'Inactivo'" [severity]="rowData.is_active ? 'success' : 'secondary'"></p-tag>
                        </td>
                        <td class="text-center">
                            <div class="action-buttons">
                                <p-button icon="pi pi-pencil" [rounded]="true" [text]="true" severity="info" [routerLink]="['/catalog/categories/edit', rowData.id]"></p-button>
                                <p-button icon="pi pi-trash" [rounded]="true" [text]="true" severity="danger" (onClick)="deleteCategory(rowData)"></p-button>
                            </div>
                        </td>
                    </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                    <tr>
                        <td colspan="4" class="empty-state">
                            <i class="pi pi-inbox empty-icon"></i>
                            <p class="empty-text">No se encontraron categorías registradas.</p>
                        </td>
                    </tr>
                </ng-template>
            </p-treeTable>
        </div>
    </div>
  `,
  styles: [`
    .category-list-container {
        padding: 2rem;
    }
    .list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
    }
    .list-title {
        margin: 0;
        font-weight: 700;
        color: var(--p-text-color);
    }
    .list-subtitle {
        color: var(--p-text-secondary-color);
        margin: 0.25rem 0 0 0;
    }
    .list-card {
        background: var(--p-surface-0);
        border-radius: var(--p-border-radius);
        box-shadow: 0 4px 15px rgba(0,0,0,0.05);
        padding: 1.5rem;
    }
    .fw-bold {
        font-weight: 700;
    }
    .text-secondary {
        color: var(--p-text-secondary-color);
    }
    .text-center {
        text-align: center;
    }
    .action-buttons {
        display: flex;
        justify-content: center;
        gap: 0.5rem;
    }
    .empty-state {
        text-align: center;
        padding: 3rem;
    }
    .empty-icon {
        font-size: 2.5rem;
        color: var(--p-text-muted-color);
        margin-bottom: 1rem;
        display: block;
    }
    .empty-text {
        color: var(--p-text-secondary-color);
        margin: 0;
    }
  `]
})
export class CategoryListComponent implements OnInit {
  categoriesTree: TreeNode[] = [];
  rawCategories: Category[] = [];

  constructor(private categoryService: CategoryService) { }

  ngOnInit(): void {
    this.loadCategories();
  }

  loadCategories() {
    this.categoryService.getCategories().subscribe({
      next: (data) => {
        this.rawCategories = data;
        this.categoriesTree = this.buildTreeNodes(data);
      },
      error: (err) => console.error('Error loading categories', err)
    });
  }

  deleteCategory(category: Category) {
    if (confirm(`¿Estás seguro de eliminar la categoría "${category.name}"?`)) {
      this.categoryService.deleteCategory(category.id).subscribe({
        next: () => {
          this.loadCategories(); // Reload the tree
        },
        error: (err) => {
          console.error(err);
          alert("No se pudo eliminar: " + (err.error?.detail || err.message));
        }
      });
    }
  }

  private buildTreeNodes(categories: Category[], parentId: number | null | undefined = null): TreeNode[] {
    const nodes: TreeNode[] = [];
    
    const children = categories.filter(c => {
      if (parentId === null || parentId === undefined) {
        return c.parent_id === null || c.parent_id === undefined;
      }
      return c.parent_id === parentId;
    });

    for (const child of children) {
      const node: TreeNode = {
        data: child,
        expanded: true, // Auto-expand all for easier viewing by default
        children: this.buildTreeNodes(categories, child.id)
      };
      nodes.push(node);
    }

    return nodes;
  }
}

