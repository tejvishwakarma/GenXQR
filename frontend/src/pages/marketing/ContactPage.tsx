import { Mail, MessageSquare, MapPin, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"

export default function ContactPage() {
  return (
    <div className="pt-16 pb-24 px-4 animate-fade-in">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16 pt-8">
          <span className="section-header">
            <Mail size={14} />
            Contact us
          </span>
          <h1 className="text-4xl md:text-5xl font-bold text-white mt-6 mb-4">
            We'd love to <span className="gradient-text">hear from you</span>
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Have a question about GenXQR or want to discuss a custom enterprise plan? Reach out to our team.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Contact Info */}
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-white mb-6">Get in touch</h2>
            
            <div className="grid sm:grid-cols-2 gap-6">
              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="w-10 h-10 rounded-xl bg-violet-600/20 text-violet-400 flex items-center justify-center mb-4">
                    <MessageSquare size={20} />
                  </div>
                  <h3 className="text-white font-semibold mb-2">Support</h3>
                  <p className="text-zinc-400 text-sm mb-4">We're here to help with any technical or account issues.</p>
                  <a href="mailto:support@genxqr.com" className="text-violet-400 text-sm font-medium hover:text-violet-300">
                    support@genxqr.com
                  </a>
                </CardContent>
              </Card>

              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4">
                    <Phone size={20} />
                  </div>
                  <h3 className="text-white font-semibold mb-2">Sales</h3>
                  <p className="text-zinc-400 text-sm mb-4">Questions about pricing or enterprise features?</p>
                  <a href="mailto:sales@genxqr.com" className="text-blue-400 text-sm font-medium hover:text-blue-300">
                    sales@genxqr.com
                  </a>
                </CardContent>
              </Card>
            </div>

            <Card className="p-6">
              <CardContent className="p-0 flex items-start gap-4">
                <div className="w-10 h-10 shrink-0 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center mt-1">
                  <MapPin size={20} />
                </div>
                <div>
                  <h3 className="text-white font-semibold mb-2">Headquarters</h3>
                  <p className="text-zinc-400 text-sm leading-relaxed">
                    GenXQR Inc.<br />
                    100 Innovation Drive, Suite 300<br />
                    San Francisco, CA 94107<br />
                    United States
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Contact Form */}
          <Card className="p-8">
            <CardContent className="p-0 space-y-5">
              <h2 className="text-2xl font-bold text-white mb-6">Send a message</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="label-text">First Name</label>
                  <Input placeholder="John" />
                </div>
                <div className="space-y-2">
                  <label className="label-text">Last Name</label>
                  <Input placeholder="Doe" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="label-text">Work Email</label>
                <Input type="email" placeholder="john@company.com" />
              </div>

              <div className="space-y-2">
                <label className="label-text">Subject</label>
                <select className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-300 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all appearance-none">
                  <option>General Inquiry</option>
                  <option>Sales & Enterprise</option>
                  <option>Technical Support</option>
                  <option>Billing Question</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="label-text">Message</label>
                <textarea 
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 transition-all resize-none h-32"
                  placeholder="How can we help you?"
                ></textarea>
              </div>

              <Button className="w-full" size="lg">Send Message</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
