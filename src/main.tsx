import React from "react"
import { createRoot } from "react-dom/client"

import { bootOS } from "./os/boot"
import { App } from "./ui/App"
import "./styles.css"

bootOS()

const el = document.getElementById("root")!
createRoot(el).render(<App />)
