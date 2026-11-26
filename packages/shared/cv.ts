export interface CvMeta {
  id: string;
  vacancyId: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface CvDoc extends CvMeta {
  markdown: string;
}

export interface GenerateCvRequest {
  vacancyId: string;
  instructions?: string;
}
