import { MySQL } from 'dt-sql-parser/dist/parser/mysql'

import { installValidator } from './sql-workspace-validator-base'

installValidator(() => new MySQL())
