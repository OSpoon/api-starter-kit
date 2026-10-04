export interface TodoCard {
  id: string
  title: string
  description?: string
}

export interface TodoColumn {
  id: string
  title: string
  cards: TodoCard[]
}
