import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    await this.db.rawQuery(`
      ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_id_foreign;
      ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_foreign FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;

      ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_foreign;
      ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_foreign FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT;

      ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_id_foreign;
      ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_foreign FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE RESTRICT;
    `)
  }

  async down() {
    await this.db.rawQuery(`
      ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_id_foreign;
      ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_id_foreign FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

      ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_role_id_foreign;
      ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_role_id_foreign FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE;

      ALTER TABLE role_permissions DROP CONSTRAINT IF EXISTS role_permissions_permission_id_foreign;
      ALTER TABLE role_permissions ADD CONSTRAINT role_permissions_permission_id_foreign FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;
    `)
  }
}
