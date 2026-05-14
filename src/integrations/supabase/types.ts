export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      itens: {
        Row: {
          categoria: string
          created_at: string
          id: string
          nome: string
          subcategoria: string | null
          unidade: string
          updated_at: string
        }
        Insert: {
          categoria: string
          created_at?: string
          id?: string
          nome: string
          subcategoria?: string | null
          unidade: string
          updated_at?: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          nome?: string
          subcategoria?: string | null
          unidade?: string
          updated_at?: string
        }
        Relationships: []
      }
      jobs: {
        Row: {
          created_at: string | null
          id: string
          pdf_url: string | null
          requisicao_id: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          pdf_url?: string | null
          requisicao_id?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          pdf_url?: string | null
          requisicao_id?: string | null
          status?: string | null
        }
        Relationships: []
      }
      programa_produtos: {
        Row: {
          created_at: string
          id: string
          item_id: string
          programa_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          programa_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          programa_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programa_produtos_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "itens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programa_produtos_programa_id_fkey"
            columns: ["programa_id"]
            isOneToOne: false
            referencedRelation: "programas"
            referencedColumns: ["id"]
          },
        ]
      }
      programas: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      requisicao_itens: {
        Row: {
          categoria: string | null
          created_at: string
          estoque: string | null
          id: string
          item_descricao: string | null
          item_nome: string
          ordem: number
          quantidade_fornecida: string | null
          quantidade_solicitada: string | null
          requisicao_id: string
          unidade: string | null
          updated_at: string
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          estoque?: string | null
          id?: string
          item_descricao?: string | null
          item_nome: string
          ordem: number
          quantidade_fornecida?: string | null
          quantidade_solicitada?: string | null
          requisicao_id: string
          unidade?: string | null
          updated_at?: string
        }
        Update: {
          categoria?: string | null
          created_at?: string
          estoque?: string | null
          id?: string
          item_descricao?: string | null
          item_nome?: string
          ordem?: number
          quantidade_fornecida?: string | null
          quantidade_solicitada?: string | null
          requisicao_id?: string
          unidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requisicao_itens_requisicao_id_fkey"
            columns: ["requisicao_id"]
            isOneToOne: false
            referencedRelation: "requisicoes"
            referencedColumns: ["id"]
          },
        ]
      }
      requisicoes: {
        Row: {
          admin_attachment: Json | null
          categoria: string | null
          created_at: string
          data: string | null
          id: string
          items: Json
          printed_at: string | null
          return_reason: string | null
          return_target: string | null
          returned_at: string | null
          saida_codigo: string | null
          setor: string | null
          signed_attachment: Json | null
          solicitante: string | null
          solicitante_cpf: string | null
          solicitante_funcao: string | null
          status: string
          timestamp: number | null
          updated_at: string
        }
        Insert: {
          admin_attachment?: Json | null
          categoria?: string | null
          created_at?: string
          data?: string | null
          id?: string
          items?: Json
          printed_at?: string | null
          return_reason?: string | null
          return_target?: string | null
          returned_at?: string | null
          saida_codigo?: string | null
          setor?: string | null
          signed_attachment?: Json | null
          solicitante?: string | null
          solicitante_cpf?: string | null
          solicitante_funcao?: string | null
          status?: string
          timestamp?: number | null
          updated_at?: string
        }
        Update: {
          admin_attachment?: Json | null
          categoria?: string | null
          created_at?: string
          data?: string | null
          id?: string
          items?: Json
          printed_at?: string | null
          return_reason?: string | null
          return_target?: string | null
          returned_at?: string | null
          saida_codigo?: string | null
          setor?: string | null
          signed_attachment?: Json | null
          solicitante?: string | null
          solicitante_cpf?: string | null
          solicitante_funcao?: string | null
          status?: string
          timestamp?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      setores: {
        Row: {
          created_at: string
          descricao: string | null
          id: number
          nome: string
          programa: string | null
          responsavel: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: number
          nome: string
          programa?: string | null
          responsavel?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: number
          nome?: string
          programa?: string | null
          responsavel?: string | null
        }
        Relationships: []
      }
      unidades_medida: {
        Row: {
          created_at: string
          id: number
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: number
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: number
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_whatsapp_reminder_ack: {
        Row: {
          created_at: string
          id: string
          reminder_date: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reminder_date: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reminder_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_whatsapp_reminder_ack_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          auth_user_id: string | null
          categorias_permitidas: Json
          cpf: string | null
          created_at: string
          email: string
          funcao: string | null
          id: string
          is_admin: boolean
          nome: string
          role: string
            setor: string | null
            unidade_nome: string | null
            updated_at: string
            whatsapp: string | null
          }
          Insert: {
          auth_user_id?: string | null
          categorias_permitidas?: Json
          cpf?: string | null
          created_at?: string
          email: string
          funcao?: string | null
          id?: string
          is_admin?: boolean
          nome: string
          role?: string
            setor?: string | null
            unidade_nome?: string | null
            updated_at?: string
            whatsapp?: string | null
          }
          Update: {
          auth_user_id?: string | null
          categorias_permitidas?: Json
          cpf?: string | null
          created_at?: string
          email?: string
          funcao?: string | null
          id?: string
          is_admin?: boolean
          nome?: string
          role?: string
            setor?: string | null
            unidade_nome?: string | null
            updated_at?: string
            whatsapp?: string | null
          }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_pending_signature_control: {
        Args: { p_localidade?: string | null; p_nome?: string | null }
        Returns: {
          localidade: string
          nome: string
          quantidade_assinaturas_pendentes: number
        }[]
      }
      is_admin_user: { Args: never; Returns: boolean }
      replace_requisicao_items: {
        Args: { p_items?: Json; p_requisicao_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
