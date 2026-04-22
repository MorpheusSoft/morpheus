export interface Category {
  id: number;
  name: string;
  slug?: string;
  parent_id?: number | null;
  path?: string;
  is_active: boolean;
  children?: Category[]; // For the Tree structure
}

export interface CategoryCreate {
  name: string;
  slug?: string;
  parent_id?: number | null;
  is_active?: boolean;
}
